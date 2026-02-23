
import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider, useGame } from './context/GameContext';
import { SoundProvider } from './context/SoundContext';
import { PreloaderProvider } from './context/PreloaderContext';
import TutorialOverlay from './components/TutorialOverlay';
import Navbar from './components/Navbar';
import Toast from './components/Toast';
import Login from './views/Login';

// ── Lazy-loaded views ──────────────────────────────────────
const Dashboard          = lazy(() => import('./views/Dashboard'));
const Collection         = lazy(() => import('./views/Collection'));
const Shop               = lazy(() => import('./views/Shop'));
const Inventory          = lazy(() => import('./views/Inventory'));
const Marketplace        = lazy(() => import('./views/Marketplace'));
const Trading            = lazy(() => import('./views/Trading'));
const BattleArena        = lazy(() => import('./views/BattleArena'));
const Decks              = lazy(() => import('./views/Decks'));
const Leaderboard        = lazy(() => import('./views/Leaderboard'));
const Friends            = lazy(() => import('./views/Friends'));
const UserProfile        = lazy(() => import('./views/UserProfile'));
const SeasonPass         = lazy(() => import('./views/SeasonPass'));
const CollectionMissions = lazy(() => import('./views/CollectionMissions'));

const LoadingScreen = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-950">
    <div className="text-indigo-400 font-mono animate-pulse tracking-widest text-sm">LOADING MODULE...</div>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useGame();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="animate-spin h-10 w-10 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RouterRoutes: React.FC = () => (
  <Routes>
    <Route path="/"              element={<Dashboard />} />
    <Route path="/shop"          element={<Shop />} />
    <Route path="/inventory"     element={<Inventory />} />
    <Route path="/collection"    element={<Collection />} />
    <Route path="/decks"         element={<Decks />} />
    <Route path="/battle"        element={<BattleArena />} />
    <Route path="/marketplace"   element={<Marketplace />} />
    <Route path="/trading"       element={<Trading />} />
    <Route path="/friends"       element={<Friends />} />
    {/* Profile Route: Handles both current user and public profiles */}
    <Route path="/profile"       element={<UserProfile />} />
    <Route path="/profile/:userId" element={<UserProfile />} />
    
    <Route path="/missions"      element={<CollectionMissions />} />
    <Route path="/leaderboard"   element={<Leaderboard />} />
    <Route path="/season-pass"   element={<SeasonPass />} />
    {/* Legacy redirects */}
    <Route path="/quests"        element={<Navigate to="/missions" replace />} />
    <Route path="/item-shop"     element={<Navigate to="/shop" replace />} />
    <Route path="*"              element={<Navigate to="/" replace />} />
  </Routes>
);

const GlobalUI: React.FC = () => {
  const { toasts, removeToast } = useGame();
  return <Toast toasts={toasts} removeToast={removeToast} />;
};

const Layout: React.FC = () => (
  <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
    <Navbar />
    <TutorialOverlay />
    <main className="flex-1 container mx-auto px-4 py-8">
      <Suspense fallback={<LoadingScreen />}>
        <RouterRoutes />
      </Suspense>
    </main>
  </div>
);

const AppContent: React.FC = () => {
  const { user } = useGame();
  return (
    <Router>
      <GlobalUI />
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" /> : <Login />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        } />
      </Routes>
    </Router>
  );
};

const App: React.FC = () => (
  <SoundProvider>
    <PreloaderProvider>
      <GameProvider>
        <AppContent />
      </GameProvider>
    </PreloaderProvider>
  </SoundProvider>
);

export default App;
