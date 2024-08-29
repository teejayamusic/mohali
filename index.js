const express = require('express');
const mysql = require('mysql');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
// Set CORS options to allow your frontend's origin
const corsOptions = {
    origin: '*', // Allow requests from your frontend
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Specify the allowed HTTP methods
    credentials: true, // Allow credentials such as cookies to be sent with requests
    optionsSuccessStatus: 200 // Some legacy browsers (IE11, etc.) may not handle 204 correctly, so set the status to 200
  };
  
  // Use CORS middleware with the specified options
  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static('uploads'));

// Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    console.log('Connected to the MySQL database.');
});

// Multer setup for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Routes
app.get('/', (req, res) => {
    res.send('Server is working!');
});
// Register Dealer
app.post('/register', (req, res) => {
    const { name, email, password } = req.body;

    const hashedPassword = bcrypt.hashSync(password, 10);
    const query = 'INSERT INTO dealers (name, email, password) VALUES (?, ?, ?)';

    db.query(query, [name, email, hashedPassword], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        // result.insertId will give you the dealer's ID after insertion
        const dealerId = result.insertId;
        console.log(dealerId)
        const token = jwt.sign({ dealerId: dealerId }, process.env.JWT_SECRET, { expiresIn: '1h' });


        res.json({
            message: 'Dealer registered successfully.',
            token: token // Send the token in the response
        });
    });
});
app.use('/uploads', express.static('uploads'));
// Login Dealer
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    const query = 'SELECT * FROM dealers WHERE email = ?';
    db.query(query, [email], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (results.length === 0) return res.status(401).json({ error: 'Invalid email or password.' });

        const dealer = results[0];
        if (!bcrypt.compareSync(password, dealer.password)) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign({ dealerId: dealer.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    });
});

// Middleware to authenticate token
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    if (!token) {
        console.log('No token provided');
        return res.status(403).json({ error: 'Access denied, token missing.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log('Token verification error:', err.message);
            return res.status(401).json({ error: 'Invalid token.' });
        }

        console.log('Decoded token:', decoded);
        req.dealerId = decoded.dealerId;
        console.log('Dealer ID from token:', req.dealerId);
        next();
    });
}


// Add Property
// Add Property
app.post('/add-property', authenticateToken, upload.single('image'), (req, res) => {
    const { name, location, bedrooms, bathrooms, kitchen, ac, wifi, parking, food } = req.body;
    const image = req.file ? req.file.path : '';

    // Convert checkbox values to integers
    const convertToBoolean = value => value === 'true' ? 1 : 0;

    const query = `INSERT INTO properties (dealer_id, name, location, image, bedrooms, bathrooms, kitchen, ac, wifi, parking, food)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

    db.query(query, [
        req.dealerId,
        name,
        location,
        image,
        bedrooms,
        bathrooms,
        convertToBoolean(kitchen),
        convertToBoolean(ac),
        convertToBoolean(wifi),
        convertToBoolean(parking),
        convertToBoolean(food)
    ], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Property added successfully.' });
    });
});


















app.get('/properties', (req, res) => {
    const { bedrooms, kitchen, wifi, parking, food, search, page = 1, limit = 20 } = req.query;

    let query = 'SELECT * FROM properties WHERE 1=1';
    const params = [];

    // Add filters
    if (bedrooms) {
        query += ' AND bedrooms = ?';
        params.push(bedrooms);
    }
    if (kitchen) {
        query += ' AND kitchen = ?';
        params.push(kitchen);
    }
    if (wifi) {
        query += ' AND wifi = ?';
        params.push(wifi);
    }
    if (parking) {
        query += ' AND parking = ?';
        params.push(parking);
    }
    if (food) {
        query += ' AND food = ?';
        params.push(food);
    }

    // Add search functionality (case-insensitive partial matches)
    if (search) {
        query += ' AND (LOWER(name) LIKE ? OR LOWER(location) LIKE ?)';
        const searchValue = `%${search.toLowerCase()}%`;
        params.push(searchValue, searchValue);
    }

    // Add pagination
    const offset = (page - 1) * limit;
    query += ' LIMIT ? OFFSET ?';
    params.push(parseInt(limit), offset);

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        // Construct the full URL for each image
        const propertiesWithFullImageUrl = results.map(property => {
            return {
                ...property,
                image: property.image ? `${req.protocol}://${req.get('host')}/${property.image}` : null
            };
        });

        res.json(propertiesWithFullImageUrl); // Send data with full image URL
    });
});




// Get Properties by Dealer ID
app.get('/dealer/properties', authenticateToken, (req, res) => {
    const dealerId = req.dealerId;

    const query = 'SELECT * FROM properties WHERE dealer_id = ?';
    db.query(query, [dealerId], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json(results); // Send the properties of the dealer
    });
});

// Update Property
app.put('/dealer/properties/:propertyId', authenticateToken, upload.single('image'), (req, res) => {
    const { propertyId } = req.params;
    const { name, location, bedrooms, bathrooms, kitchen, ac, wifi, parking, food } = req.body;
    const image = req.file ? req.file.path : '';

    const convertToBoolean = value => value === 'true' ? 1 : 0;

    const query = `UPDATE properties SET name = ?, location = ?, image = ?, bedrooms = ?, bathrooms = ?, kitchen = ?, ac = ?, wifi = ?, parking = ?, food = ? 
                   WHERE id = ? AND dealer_id = ?`;

    db.query(query, [
        name,
        location,
        image,
        bedrooms,
        bathrooms,
        convertToBoolean(kitchen),
        convertToBoolean(ac),
        convertToBoolean(wifi),
        convertToBoolean(parking),
        convertToBoolean(food),
        propertyId,
        req.dealerId
    ], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ message: 'Property updated successfully.' });
    });
});
// Delete Property
app.delete('/dealer/properties/:propertyId', authenticateToken, (req, res) => {
    const { propertyId } = req.params;

    const query = 'DELETE FROM properties WHERE id = ? AND dealer_id = ?';
    db.query(query, [propertyId, req.dealerId], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        res.json({ message: 'Property deleted successfully.' });
    });
});


// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});



