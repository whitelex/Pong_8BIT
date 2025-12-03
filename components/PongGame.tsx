import React, { useRef, useEffect, useState, useCallback } from 'react';
import { playSound, SoundType, toggleMute, getMuted } from '../utils/sound';

// Declare PeerJS globally as it is loaded via script tag
declare const Peer: any;

// --- Constants ---
// Logical Resolution (Physics runs on this)
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Render Resolution (Swaps on mobile)
const DESKTOP_WIDTH = 800;
const DESKTOP_HEIGHT = 600;
const MOBILE_WIDTH = 600;
const MOBILE_HEIGHT = 800;

const PADDLE_WIDTH = 15;
const PADDLE_HEIGHT = 80;
const BALL_SIZE = 12;
const WINNING_SCORE = 11;
const COMPUTER_SPEED = 6.5; 
const INITIAL_BALL_SPEED = 7;
const MAX_BALL_SPEED = 14;

// --- Types ---
interface Ball {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
}

interface GameState {
  ball: Ball;
  paddleLeftY: number;  // Player 1 (Host or Local Player)
  paddleRightY: number; // Player 2 (Computer or Remote Client)
  scoreLeft: number;
  scoreRight: number;
  isRunning: boolean;
  isGameOver: boolean;
  winner: 'PLAYER 1' | 'PLAYER 2' | 'COMPUTER' | null;
  mode: 'SINGLE' | 'HOST' | 'CLIENT';
}

interface NetworkState {
  ball: Ball;
  pLeft: number;
  pRight: number;
  sLeft: number;
  sRight: number;
}

interface PongGameProps {
  isMobile: boolean;
}

const PongGame: React.FC<PongGameProps> = ({ isMobile }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);
  
  // PeerJS Refs
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  
  // Mutable game state
  const gameState = useRef<GameState>({
    ball: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, dx: INITIAL_BALL_SPEED, dy: INITIAL_BALL_SPEED, speed: INITIAL_BALL_SPEED },
    paddleLeftY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    paddleRightY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
    scoreLeft: 0,
    scoreRight: 0,
    isRunning: false,
    isGameOver: false,
    winner: null,
    mode: 'SINGLE',
  });

  // UI State
  const [uiState, setUiState] = useState<{
    scoreL: number;
    scoreR: number;
    gameStatus: 'MENU' | 'HOST_WAIT' | 'JOIN_INPUT' | 'PLAYING' | 'GAME_OVER';
    winner: string | null;
    isMuted: boolean;
    hostId: string | null;
    joinId: string;
    connectionStatus: string;
  }>({
    scoreL: 0,
    scoreR: 0,
    gameStatus: 'MENU',
    winner: null,
    isMuted: getMuted(),
    hostId: null,
    joinId: '',
    connectionStatus: '',
  });

  const canvasWidth = isMobile ? MOBILE_WIDTH : DESKTOP_WIDTH;
  const canvasHeight = isMobile ? MOBILE_HEIGHT : DESKTOP_HEIGHT;

  const handleToggleMute = () => {
    const muted = toggleMute();
    setUiState(prev => ({ ...prev, isMuted: muted }));
    if (!muted) playSound(SoundType.PADDLE_HIT);
  };

  // --- Network Logic ---

  const initPeer = () => {
    if (peerRef.current) peerRef.current.destroy();
    const id = Math.random().toString(36).substr(2, 5).toUpperCase();
    const peer = new Peer(id);
    peerRef.current = peer;
    return peer;
  };

  const startHost = () => {
    setUiState(prev => ({ ...prev, gameStatus: 'HOST_WAIT', hostId: 'Generating...', connectionStatus: 'Creating Room...' }));
    
    const peer = initPeer();

    peer.on('open', (id: string) => {
      setUiState(prev => ({ ...prev, hostId: id, connectionStatus: 'Waiting for player...' }));
    });

    peer.on('connection', (conn: any) => {
      connRef.current = conn;
      setUiState(prev => ({ ...prev, connectionStatus: 'Connected! Starting...', gameStatus: 'PLAYING' }));
      
      conn.on('data', (data: any) => {
        if (data.type === 'INPUT') {
          gameState.current.paddleRightY = data.y;
        }
      });
      
      startGame('HOST');
    });
  };

  const joinGame = () => {
    if (!uiState.joinId) return;
    setUiState(prev => ({ ...prev, connectionStatus: 'Connecting...' }));

    const peer = initPeer();

    peer.on('open', () => {
      const conn = peer.connect(uiState.joinId);
      connRef.current = conn;

      conn.on('open', () => {
        setUiState(prev => ({ ...prev, connectionStatus: 'Connected!', gameStatus: 'PLAYING' }));
        startGame('CLIENT');
      });

      conn.on('data', (data: any) => {
        if (data.type === 'STATE') {
          handleNetworkState(data.state);
        } else if (data.type === 'SOUND') {
          playSound(data.sound);
        } else if (data.type === 'OVER') {
           endGame(data.winner);
        }
      });
    });
    
    peer.on('error', (err: any) => {
        setUiState(prev => ({ ...prev, connectionStatus: 'Error: ' + err.type }));
    });
  };

  const handleNetworkState = (netState: NetworkState) => {
    const state = gameState.current;
    
    state.scoreLeft = netState.sLeft;
    state.scoreRight = netState.sRight;
    state.paddleLeftY = netState.pLeft; 
    
    const dist = Math.sqrt(Math.pow(state.ball.x - netState.ball.x, 2) + Math.pow(state.ball.y - netState.ball.y, 2));
    
    if (dist > 50) {
      state.ball.x = netState.ball.x;
      state.ball.y = netState.ball.y;
    } else {
      state.ball.x += (netState.ball.x - state.ball.x) * 0.5;
      state.ball.y += (netState.ball.y - state.ball.y) * 0.5;
    }
    
    state.ball.dx = netState.ball.dx;
    state.ball.dy = netState.ball.dy;
    
    setUiState(prev => ({
        ...prev,
        scoreL: state.scoreLeft,
        scoreR: state.scoreRight
    }));
  };

  const sendHostUpdate = () => {
    if (connRef.current && connRef.current.open) {
      const state = gameState.current;
      const netState: NetworkState = {
        ball: state.ball,
        pLeft: state.paddleLeftY,
        pRight: state.paddleRightY,
        sLeft: state.scoreLeft,
        sRight: state.scoreRight
      };
      connRef.current.send({ type: 'STATE', state: netState });
    }
  };

  const sendClientInput = () => {
    if (connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'INPUT', y: gameState.current.paddleRightY });
    }
  };

  const sendSound = (type: SoundType) => {
    playSound(type); 
    if (gameState.current.mode === 'HOST' && connRef.current && connRef.current.open) {
      connRef.current.send({ type: 'SOUND', sound: type });
    }
  };

  // --- Game Logic ---

  const resetBall = (winnerSide: 'left' | 'right') => {
    const state = gameState.current;
    state.ball.x = GAME_WIDTH / 2 - BALL_SIZE / 2;
    state.ball.y = GAME_HEIGHT / 2 - BALL_SIZE / 2;
    state.ball.speed = INITIAL_BALL_SPEED;
    
    const directionX = winnerSide === 'left' ? 1 : -1; 
    const directionY = Math.random() > 0.5 ? 1 : -1;
    
    state.ball.dx = directionX * state.ball.speed;
    state.ball.dy = directionY * (state.ball.speed * 0.75); 
  };

  const update = () => {
    const state = gameState.current;
    if (!state.isRunning || state.isGameOver) return;

    if (state.mode === 'CLIENT') {
        state.ball.x += state.ball.dx;
        state.ball.y += state.ball.dy;
        sendClientInput();
        return; 
    }

    if (state.mode === 'SINGLE') {
        const targetY = state.ball.y - (PADDLE_HEIGHT / 2);
        if (targetY > state.paddleRightY + 10) {
            state.paddleRightY += COMPUTER_SPEED;
        } else if (targetY < state.paddleRightY - 10) {
            state.paddleRightY -= COMPUTER_SPEED;
        }
        state.paddleRightY = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, state.paddleRightY));
    }

    state.ball.x += state.ball.dx;
    state.ball.y += state.ball.dy;

    if (state.ball.y <= 0 || state.ball.y + BALL_SIZE >= GAME_HEIGHT) {
      state.ball.dy *= -1;
      state.ball.y = state.ball.y <= 0 ? 0 : GAME_HEIGHT - BALL_SIZE;
      sendSound(SoundType.WALL_HIT);
    }

    const paddleLeft = { x: 20, y: state.paddleLeftY, w: PADDLE_WIDTH, h: PADDLE_HEIGHT };
    const paddleRight = { x: GAME_WIDTH - 20 - PADDLE_WIDTH, y: state.paddleRightY, w: PADDLE_WIDTH, h: PADDLE_HEIGHT };
    const ballRect = { x: state.ball.x, y: state.ball.y, w: BALL_SIZE, h: BALL_SIZE };

    if (
      ballRect.x < paddleLeft.x + paddleLeft.w &&
      ballRect.x + ballRect.w > paddleLeft.x &&
      ballRect.y < paddleLeft.y + paddleLeft.h &&
      ballRect.y + ballRect.h > paddleLeft.y
    ) {
      state.ball.dx = Math.abs(state.ball.dx);
      const hitPoint = ballRect.y + ballRect.h / 2 - (paddleLeft.y + paddleLeft.h / 2);
      state.ball.dy = (hitPoint / (paddleLeft.h / 2)) * 10;
      if (state.ball.speed < MAX_BALL_SPEED) {
        state.ball.speed += 0.5;
        state.ball.dx = state.ball.speed;
      }
      sendSound(SoundType.PADDLE_HIT);
    }

    if (
      ballRect.x < paddleRight.x + paddleRight.w &&
      ballRect.x + ballRect.w > paddleRight.x &&
      ballRect.y < paddleRight.y + paddleRight.h &&
      ballRect.y + ballRect.h > paddleRight.y
    ) {
      state.ball.dx = -Math.abs(state.ball.dx);
      const hitPoint = ballRect.y + ballRect.h / 2 - (paddleRight.y + paddleRight.h / 2);
      state.ball.dy = (hitPoint / (paddleRight.h / 2)) * 10;
      if (state.ball.speed < MAX_BALL_SPEED) {
        state.ball.speed += 0.5;
        state.ball.dx = -state.ball.speed;
      }
      sendSound(SoundType.PADDLE_HIT);
    }

    if (state.ball.x < 0) {
      state.scoreRight += 1; 
      sendSound(SoundType.SCORE_ENEMY); 
      checkWinCondition();
      resetBall('right');
    } else if (state.ball.x > GAME_WIDTH) {
      state.scoreLeft += 1;
      sendSound(SoundType.SCORE_PLAYER);
      checkWinCondition();
      resetBall('left');
    }

    if (state.mode === 'HOST') {
        sendHostUpdate();
    }
  };

  const checkWinCondition = () => {
    const state = gameState.current;
    
    setUiState(prev => ({
      ...prev,
      scoreL: state.scoreLeft,
      scoreR: state.scoreRight
    }));

    if (state.scoreLeft >= WINNING_SCORE) {
      endGame('PLAYER 1');
    } else if (state.scoreRight >= WINNING_SCORE) {
      endGame(state.mode === 'SINGLE' ? 'COMPUTER' : 'PLAYER 2');
    }
  };

  const endGame = (winner: string) => {
    gameState.current.isRunning = false;
    gameState.current.isGameOver = true;
    gameState.current.winner = winner as any;
    
    setUiState(prev => ({
      ...prev,
      gameStatus: 'GAME_OVER',
      winner: winner
    }));
    
    if (gameState.current.mode === 'HOST' && connRef.current) {
        connRef.current.send({ type: 'OVER', winner });
    }

    playSound(SoundType.GAME_OVER);
  };

  // --- Rendering & Transforms ---

  // Transforms logical game coordinates (800x600) to visual coordinates
  const getRenderCoords = (x: number, y: number, w: number, h: number) => {
    if (!isMobile) {
        // Desktop: 1:1 mapping
        return { x, y, w, h };
    }

    const state = gameState.current;
    // Mobile: Rotate so local player is always at the bottom
    
    if (state.mode === 'CLIENT') {
        // CLIENT PERSPECTIVE (P2): 
        // Logic: P2 is at x=780. We want that at y=800.
        // Game X(800) -> Screen Y(800). Game Y(0) -> Screen X(600).
        // Rotate 90deg CW + shifts.
        // Formula: NewX = GameHeight - GameY, NewY = GameX.
        return {
            x: GAME_HEIGHT - y - h, // Invert Y for X axis
            y: x,
            w: h, // Swap width/height
            h: w
        };
    } else {
        // HOST/SINGLE PERSPECTIVE (P1):
        // Logic: P1 is at x=20. We want that at y=800.
        // Game X(0) -> Screen Y(800).
        // Formula: NewX = GameY, NewY = GameWidth - GameX.
        return {
            x: y,
            y: GAME_WIDTH - x - w, // Invert X for Y axis
            w: h,
            h: w
        };
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const state = gameState.current;

    // Clear
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Net
    ctx.strokeStyle = '#33ff33';
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 15]);
    ctx.beginPath();
    
    if (isMobile) {
        // Horizontal net for vertical mobile layout
        ctx.moveTo(0, canvasHeight / 2);
        ctx.lineTo(canvasWidth, canvasHeight / 2);
    } else {
        // Vertical net for horizontal desktop layout
        ctx.moveTo(canvasWidth / 2, 0);
        ctx.lineTo(canvasWidth / 2, canvasHeight);
    }
    
    ctx.stroke();
    ctx.setLineDash([]);

    // Helpers to draw rotated rects
    const fillRect = (gx: number, gy: number, gw: number, gh: number, color: string = '#33ff33') => {
        const { x, y, w, h } = getRenderCoords(gx, gy, gw, gh);
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
    };

    // Paddle Left (P1/Host)
    fillRect(20, state.paddleLeftY, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Paddle Right (P2/Client/AI)
    fillRect(GAME_WIDTH - 20 - PADDLE_WIDTH, state.paddleRightY, PADDLE_WIDTH, PADDLE_HEIGHT);

    // Ball
    fillRect(state.ball.x, state.ball.y, BALL_SIZE, BALL_SIZE);
  };

  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    update();
    draw(ctx);

    requestRef.current = requestAnimationFrame(loop);
  }, [isMobile, canvasWidth, canvasHeight]); // Re-bind loop if dimensions change

  // --- Input Handling ---

  const handleInput = (clientX: number, clientY: number) => {
    if (!gameState.current.isRunning && uiState.gameStatus !== 'PLAYING') return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const state = gameState.current;
    
    if (isMobile) {
        // Mobile Input Logic
        // We map Screen X (0-Width) to Game Y (0-Height).
        // Since Game Y maps to Screen X directly in P1 view (and inverted in P2 view).
        
        const relativeX = clientX - rect.left;
        const scaleX = GAME_HEIGHT / rect.width; // Game Height is mapped to Screen Width
        
        let gameY = 0;

        if (state.mode === 'CLIENT') {
             // Screen X (0) = Game Y (600). Screen X (600) = Game Y (0).
             // Inverted X input.
             gameY = GAME_HEIGHT - (relativeX * scaleX);
        } else {
             // Screen X (0) = Game Y (0).
             gameY = relativeX * scaleX;
        }

        const newPaddleY = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, gameY - (PADDLE_HEIGHT / 2)));

        if (state.mode === 'CLIENT') {
            state.paddleRightY = newPaddleY;
        } else {
            state.paddleLeftY = newPaddleY;
        }

    } else {
        // Desktop Input Logic (Standard)
        const scaleY = GAME_HEIGHT / rect.height;
        const relativeY = (clientY - rect.top) * scaleY;
        const newY = Math.max(0, Math.min(GAME_HEIGHT - PADDLE_HEIGHT, relativeY - (PADDLE_HEIGHT / 2)));
        
        if (state.mode === 'CLIENT') {
            state.paddleRightY = newY;
        } else {
            state.paddleLeftY = newY;
        }
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleInput(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => {
        // e.preventDefault(); // Handled by CSS touch-action: none
        handleInput(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleTouchStart = (e: TouchEvent) => {
        handleInput(e.touches[0].clientX, e.touches[0].clientY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    // Add non-passive listener to prevent scroll if CSS fails
    const canvas = canvasRef.current;
    if (canvas) {
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    }

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        if (canvas) {
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchstart', handleTouchStart);
        }
    };
  }, [uiState.gameStatus, isMobile]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(requestRef.current);
  }, [loop]);

  const startGame = (mode: 'SINGLE' | 'HOST' | 'CLIENT') => {
    gameState.current = {
      ball: { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2, dx: INITIAL_BALL_SPEED, dy: INITIAL_BALL_SPEED, speed: INITIAL_BALL_SPEED },
      paddleLeftY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      paddleRightY: GAME_HEIGHT / 2 - PADDLE_HEIGHT / 2,
      scoreLeft: 0,
      scoreRight: 0,
      isRunning: true,
      isGameOver: false,
      winner: null,
      mode: mode,
    };
    
    if (mode !== 'CLIENT') {
        if (Math.random() > 0.5) gameState.current.ball.dx = -INITIAL_BALL_SPEED;
        sendSound(SoundType.GAME_START);
    }

    setUiState(prev => ({
      ...prev,
      scoreL: 0,
      scoreR: 0,
      gameStatus: 'PLAYING',
      winner: null
    }));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full cursor-none bg-black">
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-full block object-fill"
        style={{ imageRendering: 'pixelated' }}
      />

      <div className={`absolute pointer-events-none flex ${isMobile ? 'flex-col justify-center gap-64 items-center right-4 top-1/2 -translate-y-1/2' : 'top-8 left-0 w-full justify-between px-16 sm:px-32'}`}>
         {/* Rotate text for mobile players to face them? No, keep it upright for readability */}
         <div className={`text-[#33ff33] font-bold ${isMobile ? 'text-4xl' : 'text-4xl sm:text-6xl'}`}>
             {isMobile ? (gameState.current.mode === 'CLIENT' ? uiState.scoreR : uiState.scoreL) : uiState.scoreL}
         </div>
         <div className={`text-[#33ff33] font-bold ${isMobile ? 'text-4xl' : 'text-4xl sm:text-6xl'}`}>
             {isMobile ? (gameState.current.mode === 'CLIENT' ? uiState.scoreL : uiState.scoreR) : uiState.scoreR}
         </div>
      </div>

      <div className={`absolute z-30 flex gap-4 ${isMobile ? 'bottom-4 right-4' : 'top-4 right-4'}`}>
        <button 
          onClick={handleToggleMute}
          className="text-[#33ff33] text-xs sm:text-sm font-bold border border-[#33ff33] px-2 py-1 hover:bg-[#33ff33] hover:text-black transition-colors uppercase cursor-pointer pointer-events-auto"
        >
          {uiState.isMuted ? '🔇' : '🔊'}
        </button>
      </div>

      {/* --- MENU OVERLAYS --- */}

      {uiState.gameStatus === 'MENU' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <h1 className="text-[#33ff33] text-4xl sm:text-6xl mb-8 text-center text-shadow-glow tracking-tighter">
            PONG_8BIT
          </h1>
          <div className="flex flex-col gap-4 w-64 pointer-events-auto">
            <button
                onClick={() => startGame('SINGLE')}
                className="px-6 py-3 border-4 border-[#33ff33] text-[#33ff33] font-bold hover:bg-[#33ff33] hover:text-black transition-colors uppercase cursor-pointer"
            >
                1 PLAYER
            </button>
            <button
                onClick={startHost}
                className="px-6 py-3 border-4 border-[#33ff33] text-[#33ff33] font-bold hover:bg-[#33ff33] hover:text-black transition-colors uppercase cursor-pointer"
            >
                CREATE MATCH
            </button>
             <button
                onClick={() => setUiState(p => ({ ...p, gameStatus: 'JOIN_INPUT' }))}
                className="px-6 py-3 border-4 border-[#33ff33] text-[#33ff33] font-bold hover:bg-[#33ff33] hover:text-black transition-colors uppercase cursor-pointer"
            >
                JOIN MATCH
            </button>
          </div>
        </div>
      )}

      {uiState.gameStatus === 'HOST_WAIT' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20">
          <h2 className="text-[#33ff33] text-2xl mb-4 text-center px-4">WAITING FOR PLAYER</h2>
          <p className="text-white mb-2">SHARE ID:</p>
          <div className="text-[#33ff33] text-4xl font-bold border-2 border-dashed border-[#33ff33] p-4 mb-8 tracking-widest bg-black select-text pointer-events-auto">
            {uiState.hostId}
          </div>
          <p className="text-gray-400 text-xs animate-pulse mb-8">{uiState.connectionStatus}</p>
          <button
            onClick={() => {
                if (peerRef.current) peerRef.current.destroy();
                setUiState(p => ({ ...p, gameStatus: 'MENU' }));
            }}
            className="text-red-500 hover:text-red-400 underline cursor-pointer pointer-events-auto"
          >
            CANCEL
          </button>
        </div>
      )}

      {uiState.gameStatus === 'JOIN_INPUT' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 pointer-events-auto">
          <h2 className="text-[#33ff33] text-2xl mb-4">ENTER MATCH ID</h2>
          <input 
            type="text"
            maxLength={5}
            value={uiState.joinId}
            onChange={(e) => setUiState(p => ({ ...p, joinId: e.target.value.toUpperCase() }))}
            className="bg-black border-2 border-[#33ff33] text-[#33ff33] text-4xl p-2 w-48 text-center mb-8 outline-none uppercase placeholder-gray-800 rounded-none"
            placeholder="XXXXX"
          />
          <button
            onClick={joinGame}
            className="px-6 py-3 border-2 border-[#33ff33] text-[#33ff33] font-bold hover:bg-[#33ff33] hover:text-black transition-colors uppercase cursor-pointer mb-4"
          >
            CONNECT
          </button>
          <p className="text-gray-400 text-xs mb-4 min-h-[1.5em]">{uiState.connectionStatus}</p>
           <button
            onClick={() => setUiState(p => ({ ...p, gameStatus: 'MENU' }))}
            className="text-red-500 hover:text-red-400 underline cursor-pointer"
          >
            BACK
          </button>
        </div>
      )}

      {uiState.gameStatus === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-20 pointer-events-auto">
          <h2 className="text-[#33ff33] text-3xl sm:text-5xl mb-4 text-center">
            GAME OVER
          </h2>
          <div className="text-white text-xl mb-8">
            WINNER: <span className="text-[#33ff33]">{uiState.winner}</span>
          </div>
          <button
            onClick={() => {
                if (peerRef.current) peerRef.current.destroy();
                setUiState(p => ({ ...p, gameStatus: 'MENU' }));
            }}
            className="px-6 py-3 border-2 border-[#33ff33] text-[#33ff33] hover:bg-[#33ff33] hover:text-black transition-colors duration-0 uppercase cursor-pointer"
          >
            MAIN MENU
          </button>
        </div>
      )}
      
      {!isMobile && <div className="absolute bottom-4 right-4 text-[#33ff33]/30 text-[10px] pointer-events-none">
        CH-03 AV
      </div>}
    </div>
  );
};

export default PongGame;