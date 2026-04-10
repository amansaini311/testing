import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/Navbar.css';

interface NavbarProps {
  user: { id: string; role: string; email: string; fullName: string } | null;
  onLogout: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-logo">
          🗑️ Garbage Dump Manager
        </Link>
        
        <div className={`nav-menu ${mobileMenuOpen ? 'active' : ''}`}>
          <Link to="/" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
            Home
          </Link>
          <Link to="/heat-map" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
            Heat Map
          </Link>
          <Link to="/tickets" className="nav-link" onClick={() => setMobileMenuOpen(false)}>
            Tickets
          </Link>

          {user ? (
            <>
              <span className="user-info">{user.fullName} ({user.role})</span>
              
              {user.role === 'marker' && (
                <>
                  <Link to="/marker/dashboard" className="nav-link">
                    Dashboard
                  </Link>
                  <Link to="/marker/create-ticket" className="nav-link">
                    Report Dump
                  </Link>
                </>
              )}
              
              {user.role === 'volunteer' && (
                <Link to="/volunteer/dashboard" className="nav-link">
                  Dashboard
                </Link>
              )}
              
              {user.role === 'authority' && (
                <Link to="/authority/dashboard" className="nav-link">
                  Approve Tickets
                </Link>
              )}

              <button onClick={onLogout} className="btn-logout">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-login">
                Login
              </Link>
              <Link to="/register" className="btn-register">
                Register
              </Link>
            </>
          )}
        </div>

        <div className="hamburger" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
