import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/TicketsList.css';

interface Ticket {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
  initial_photo_url: string;
  location_description: string;
  ticket_generation_time: string;
}

const TicketsList: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [filterRadius, setFilterRadius] = useState(50);

  useEffect(() => {
    // Get user location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => console.log('Location access denied')
      );
    }
  }, []);

  useEffect(() => {
    fetchTickets();
  }, [location, filterRadius]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (location) {
        params.latitude = location.lat;
        params.longitude = location.lng;
        params.radius = filterRadius;
      }

      const response = await axios.get('http://localhost:5000/api/tickets', {
        params,
      });
      setTickets(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'Low':
        return '#4CAF50';
      case 'Medium':
        return '#FF9800';
      case 'High':
        return '#F44336';
      default:
        return '#999';
    }
  };

  if (loading) return <div className="loading">Loading tickets...</div>;

  return (
    <div className="container">
      <h1>Active Garbage Dumps</h1>

      {location && (
        <div className="filters">
          <label>
            Search Radius: {filterRadius} km
            <input
              type="range"
              min="5"
              max="100"
              value={filterRadius}
              onChange={(e) => setFilterRadius(Number(e.target.value))}
            />
          </label>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}

      {tickets.length === 0 ? (
        <p className="no-data">No active garbage dumps in your area</p>
      ) : (
        <div className="tickets-grid">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="ticket-card">
              <div
                className="severity-badge"
                style={{ backgroundColor: getSeverityColor(ticket.severity) }}
              >
                {ticket.severity}
              </div>
              <div className="ticket-status">{ticket.status}</div>

              <img
                src={`http://localhost:5000${ticket.initial_photo_url}`}
                alt="Dump"
                className="ticket-photo"
              />

              <div className="ticket-info">
                <p className="location">{ticket.location_description || 'No description'}</p>
                <p className="coords">
                  📍 {ticket.latitude.toFixed(4)}, {ticket.longitude.toFixed(4)}
                </p>
                <p className="date">
                  {new Date(ticket.ticket_generation_time).toLocaleDateString()}
                </p>
              </div>

              {localStorage.getItem('token') && (
                <button className="btn-primary btn-action">Claim Ticket</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TicketsList;
