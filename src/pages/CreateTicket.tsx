import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import '../styles/Forms.css';

const CreateTicket: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    severity: 'Medium',
    locationDescription: '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get user's location
  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => setError('Could not get your location')
      );
    }
  };

  // Handle photo selection
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setPhoto(e.target.files[0]);
    }
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!location) {
      setError('Please enable location access');
      setLoading(false);
      return;
    }

    if (!photo) {
      setError('Please select a photo');
      setLoading(false);
      return;
    }

    try {
      const data = new FormData();
      data.append('latitude', location.lat.toString());
      data.append('longitude', location.lng.toString());
      data.append('severity', formData.severity);
      data.append('locationDescription', formData.locationDescription);
      data.append('photo', photo);

      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:5000/api/tickets/create', data, {
        headers: { Authorization: `Bearer ${token}` },
      });

      navigate('/marker/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="form-card">
        <h1>Report Garbage Dump</h1>
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <button
              type="button"
              onClick={getLocation}
              className="btn-primary"
              disabled={loading}
            >
              📍 Get My Location
            </button>
            {location && (
              <p className="success">
                Location: {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Severity Level *</label>
            <select
              value={formData.severity}
              onChange={(e) =>
                setFormData({ ...formData, severity: e.target.value })
              }
            >
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </div>

          <div className="form-group">
            <label>Location Description</label>
            <textarea
              value={formData.locationDescription}
              onChange={(e) =>
                setFormData({ ...formData, locationDescription: e.target.value })
              }
              placeholder="e.g., Near the park, behind the shopping center..."
            />
          </div>

          <div className="form-group">
            <label>Photo of Dump *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              required
            />
            {photo && <p className="success">✓ Photo selected: {photo.name}</p>}
          </div>

          {error && <div className="error-message">{error}</div>}

          <button
            type="submit"
            className="btn-primary btn-submit"
            disabled={loading || !location || !photo}
          >
            {loading ? 'Creating...' : 'Create Ticket'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CreateTicket;
