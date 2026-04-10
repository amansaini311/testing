const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb' }));

// Storage setup for photos
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => console.error('Unexpected error on idle client', err));

// JWT Middleware
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret_key');
  } catch (err) {
    return null;
  }
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required' });

  const decoded = verifyToken(token);
  if (!decoded) return res.status(403).json({ error: 'Invalid or expired token' });

  req.user = decoded;
  next();
};

// ==================== AUTH ROUTES ====================

app.post('/api/auth/register-marker', async (req, res) => {
  try {
    const { username, fullName, email, password, isVolunteer } = req.body;

    if (!username || !fullName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Create marker
    const markerResult = await pool.query(
      'INSERT INTO markers (username, full_name, email, password_hash, is_volunteer) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, fullName, email, hashedPassword, isVolunteer ? 1 : 0]
    );

    // If marking as volunteer too, create volunteer record
    if (isVolunteer) {
      await pool.query(
        'INSERT INTO volunteers (username, full_name, email, password_hash, is_marker) VALUES ($1, $2, $3, $4, $5)',
        [username + '_vol', fullName, email, hashedPassword, 1]
      );
    }

    const token = jwt.sign(
      { id: markerResult.rows[0].id, role: 'marker', email },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Marker registered successfully',
      token,
      user: { id: markerResult.rows[0].id, role: 'marker', email }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register-volunteer', async (req, res) => {
  try {
    const { username, fullName, email, password, isMarker } = req.body;

    if (!username || !fullName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const volunteerResult = await pool.query(
      'INSERT INTO volunteers (username, full_name, email, password_hash, is_marker) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [username, fullName, email, hashedPassword, isMarker ? 1 : 0]
    );

    if (isMarker) {
      await pool.query(
        'INSERT INTO markers (username, full_name, email, password_hash, is_volunteer) VALUES ($1, $2, $3, $4, $5)',
        [username + '_mrk', fullName, email, hashedPassword, 1]
      );
    }

    const token = jwt.sign(
      { id: volunteerResult.rows[0].id, role: 'volunteer', email },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Volunteer registered successfully',
      token,
      user: { id: volunteerResult.rows[0].id, role: 'volunteer', email }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register-authority', async (req, res) => {
  try {
    const { username, fullName, email, password } = req.body;

    if (!username || !fullName || !email || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const emailDomain = email.split('@')[1];
    const domainCheck = await pool.query(
      'SELECT * FROM authorized_domains WHERE domain = $1',
      [emailDomain]
    );

    if (domainCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Email domain not authorized for authority' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const authorityResult = await pool.query(
      'INSERT INTO authority (username, full_name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING *',
      [username, fullName, email, hashedPassword]
    );

    const token = jwt.sign(
      { id: authorityResult.rows[0].id, role: 'authority', email },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'Authority registered successfully',
      token,
      user: { id: authorityResult.rows[0].id, role: 'authority', email }
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ error: 'Email, password, and role required' });
    }

    let table = role === 'marker' ? 'markers' : role === 'volunteer' ? 'volunteers' : 'authority';
    const result = await pool.query(
      `SELECT * FROM ${table} WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, role, email },
      process.env.JWT_SECRET || 'secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, role, email, fullName: user.full_name }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== TICKET ROUTES ====================

app.post('/api/tickets/create', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (req.user.role !== 'marker') {
      return res.status(403).json({ error: 'Only markers can create tickets' });
    }

    const { latitude, longitude, severity, locationDescription } = req.body;

    if (!latitude || !longitude || !severity || !req.file) {
      return res.status(400).json({ error: 'Missing required fields or photo' });
    }

    if (!['Low', 'Medium', 'High'].includes(severity)) {
      return res.status(400).json({ error: 'Invalid severity level' });
    }

    const photoUrl = `/uploads/${req.file.filename}`;

    const ticketResult = await pool.query(
      `INSERT INTO tickets (
        ticket_generated_by, latitude, longitude, severity, 
        initial_photo_url, location_description, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, latitude, longitude, severity, photoUrl, locationDescription, 'Unclaimed']
    );

    // Update marker stats
    await pool.query(
      'UPDATE markers SET tickets_generated = tickets_generated + 1 WHERE id = $1',
      [req.user.id]
    );

    // Emit real-time update
    io.emit('ticket_created', ticketResult.rows[0]);

    res.status(201).json({
      message: 'Ticket created successfully',
      ticket: ticketResult.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tickets', async (req, res) => {
  try {
    const { latitude, longitude, radius = 10 } = req.query;
    let query = `SELECT * FROM tickets WHERE status != 'Cleared'`;
    const params = [];

    // Filter by location radius if provided
    if (latitude && longitude) {
      query += ` AND 
        (6371 * acos(cos(radians($3)) * cos(radians(latitude)) * 
        cos(radians(longitude) - radians($4)) + 
        sin(radians($3)) * sin(radians(latitude)))) <= $5`;
      params.push(latitude, longitude, latitude, longitude, radius);
    }

    query += ' ORDER BY ticket_generation_time DESC';

    const result = await pool.query(query, params.length > 0 ? params : undefined);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tickets/heat-map', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        latitude, longitude, severity, COUNT(*) as count
      FROM tickets
      WHERE status != 'Cleared'
      GROUP BY latitude, longitude, severity
    `);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets/:ticketId/claim', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({ error: 'Only volunteers can claim tickets' });
    }

    const { ticketId } = req.params;

    // Check if ticket exists and is unclaimed
    const ticketCheck = await pool.query(
      'SELECT * FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];
    if (ticket.ticket_claimed_by) {
      return res.status(409).json({ error: 'Ticket already claimed' });
    }

    if (ticket.status !== 'Unclaimed') {
      return res.status(409).json({ error: 'Ticket is not available for claiming' });
    }

    // Claim ticket
    const claimResult = await pool.query(
      `UPDATE tickets 
       SET ticket_claimed_by = $1, status = $2, ticket_claim_time = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [req.user.id, 'In Progress', ticketId]
    );

    // Update volunteer stats
    await pool.query(
      'UPDATE volunteers SET tickets_claimed = tickets_claimed + 1 WHERE id = $1',
      [req.user.id]
    );

    io.emit('ticket_claimed', claimResult.rows[0]);

    res.json({
      message: 'Ticket claimed successfully',
      ticket: claimResult.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tickets/:ticketId/complete', authenticateToken, upload.single('photo'), async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({ error: 'Only volunteers can complete tickets' });
    }

    const { ticketId } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Cleared photo required' });
    }

    // Check ticket belongs to this volunteer
    const ticketCheck = await pool.query(
      'SELECT * FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];
    if (ticket.ticket_claimed_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only complete tickets you claimed' });
    }

    // Check 3-day limit
    const claimTime = new Date(ticket.ticket_claim_time);
    const now = new Date();
    const daysPassed = (now - claimTime) / (1000 * 60 * 60 * 24);

    if (daysPassed > 3) {
      return res.status(409).json({ error: 'Ticket claim time limit (3 days) exceeded' });
    }

    const photoUrl = `/uploads/${req.file.filename}`;

    const completeResult = await pool.query(
      `UPDATE tickets 
       SET cleared_photo_url = $1, status = $2, ticket_cleared_time = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [photoUrl, 'Cleared', ticketId]
    );

    // Update volunteer stats
    await pool.query(
      'UPDATE volunteers SET tickets_closed = tickets_closed + 1 WHERE id = $1',
      [req.user.id]
    );

    io.emit('ticket_completed', completeResult.rows[0]);

    res.json({
      message: 'Ticket completed successfully',
      ticket: completeResult.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== AUTHORITY ROUTES ====================

app.post('/api/authority/approve/:ticketId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ error: 'Only authority can approve tickets' });
    }

    const { ticketId } = req.params;

    const ticketCheck = await pool.query(
      'SELECT * FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];
    if (ticket.status !== 'Unclaimed') {
      return res.status(409).json({ error: 'Only unclaimed tickets can be approved' });
    }

    const approveResult = await pool.query(
      `UPDATE tickets 
       SET ticket_approved_by = $1
       WHERE id = $2 RETURNING *`,
      [req.user.id, ticketId]
    );

    // Update marker stats
    await pool.query(
      'UPDATE markers SET tickets_approved = tickets_approved + 1 WHERE id = $1',
      [ticket.ticket_generated_by]
    );

    // Update authority stats
    await pool.query(
      'UPDATE authority SET tickets_approved = tickets_approved + 1 WHERE id = $1',
      [req.user.id]
    );

    io.emit('ticket_approved', approveResult.rows[0]);

    res.json({
      message: 'Ticket approved successfully',
      ticket: approveResult.rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/authority/verify-completion/:ticketId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ error: 'Only authority can verify completions' });
    }

    const { ticketId } = req.params;
    const { approved } = req.body;

    const ticketCheck = await pool.query(
      'SELECT * FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];

    if (approved) {
      // Mark as cleared
      const verifyResult = await pool.query(
        `UPDATE tickets 
         SET status = $1
         WHERE id = $2 RETURNING *`,
        ['Cleared', ticketId]
      );

      // Update marker stats
      await pool.query(
        'UPDATE markers SET tickets_cleared = tickets_cleared + 1 WHERE id = $1',
        [ticket.ticket_generated_by]
      );

      io.emit('ticket_verified', verifyResult.rows[0]);

      res.json({
        message: 'Ticket verified and cleared',
        ticket: verifyResult.rows[0]
      });
    } else {
      // Return to volunteer for rework
      const returnResult = await pool.query(
        `UPDATE tickets 
         SET cleared_photo_url = NULL, status = $1
         WHERE id = $2 RETURNING *`,
        ['In Progress', ticketId]
      );

      io.emit('ticket_rejected', returnResult.rows[0]);

      res.json({
        message: 'Ticket returned for rework',
        ticket: returnResult.rows[0]
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/authority/notify-volunteers/:ticketId', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ error: 'Only authority can send notifications' });
    }

    const { ticketId } = req.params;
    const { radius = 10 } = req.body;

    const ticketCheck = await pool.query(
      'SELECT * FROM tickets WHERE id = $1',
      [ticketId]
    );

    if (ticketCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketCheck.rows[0];

    // Find volunteers within radius (simplified - would need geospatial queries in production)
    const volunteersResult = await pool.query(
      'SELECT id FROM volunteers'
    );

    for (const volunteer of volunteersResult.rows) {
      await pool.query(
        'INSERT INTO notifications (volunteer_id, ticket_id) VALUES ($1, $2)',
        [volunteer.id, ticketId]
      );
    }

    io.emit('volunteers_notified', { ticketId });

    res.json({
      message: 'Volunteers notified successfully',
      volunteersNotified: volunteersResult.rows.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== DASHBOARD ROUTES ====================

app.get('/api/dashboard/marker', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'marker') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT 
        tickets_generated as marked,
        tickets_approved as approved,
        tickets_cleared as cleared
      FROM markers WHERE id = $1`,
      [req.user.id]
    );

    res.json(result.rows[0] || { marked: 0, approved: 0, cleared: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/volunteer', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'volunteer') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const volunteerResult = await pool.query(
      `SELECT tickets_claimed, tickets_closed FROM volunteers WHERE id = $1`,
      [req.user.id]
    );

    const volunteer = volunteerResult.rows[0];

    // Get current location (simplified - in production would use user's actual location)
    const ticketsInRadius = await pool.query(
      `SELECT COUNT(*) as count FROM tickets WHERE status != 'Cleared'`
    );

    const claimedInRadius = await pool.query(
      `SELECT COUNT(*) as count FROM tickets 
       WHERE ticket_claimed_by = $1 AND status != 'Cleared'`,
      [req.user.id]
    );

    res.json({
      cleared: volunteer.tickets_closed,
      inRadius: ticketsInRadius.rows[0].count,
      claimedInRadius: claimedInRadius.rows[0].count
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/dashboard/authority', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const result = await pool.query(
      `SELECT tickets_approved FROM authority WHERE id = $1`,
      [req.user.id]
    );

    res.json({ approved: result.rows[0]?.tickets_approved || 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve uploads
app.use('/uploads', express.static(uploadDir));

// Socket.io for real-time updates
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = { app, io };
