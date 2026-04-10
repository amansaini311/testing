import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import MarkerDashboard from './pages/MarkerDashboard';
import VolunteerDashboard from './pages/VolunteerDashboard';
import AuthorityDashboard from './pages/AuthorityDashboard';
import CreateTicket from './pages/CreateTicket';
import TicketsList from './pages/TicketsList';
import HeatMap from './pages/HeatMap';
import './styles/App.css';

interface User {
  id: string;
  role: 'marker' | 'volunteer' | 'authority';
  email: string;
  fullName: string;
}

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    if (token && userData) {
      setUser(JSON.parse(userData));
    }
    setLoading(false);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <div className="app">
        <Navbar user={user} onLogout={handleLogout} />
        <div className="content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/heat-map" element={<HeatMap />} />
            <Route path="/tickets" element={<TicketsList />} />
            <Route
              path="/login"
              element={user ? <Navigate to="/" /> : <LoginPage setUser={setUser} />}
            />
            <Route
              path="/register"
              element={user ? <Navigate to="/" /> : <RegisterPage setUser={setUser} />}
            />
            {user?.role === 'marker' && (
              <>
                <Route path="/marker/dashboard" element={<MarkerDashboard />} />
                <Route path="/marker/create-ticket" element={<CreateTicket />} />
              </>
            )}
            {user?.role === 'volunteer' && (
              <Route path="/volunteer/dashboard" element={<VolunteerDashboard />} />
            )}
            {user?.role === 'authority' && (
              <Route path="/authority/dashboard" element={<AuthorityDashboard />} />
            )}
          </Routes>
        </div>
      </div>
    </Router>
  );
};

export default App;
