const path = require('path');
const http = require('http');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;   // hosts set PORT; falls back to 3000 locally
const app = express();
const server = http.createServer(app);

// PeerJS signaling server: lets browsers find each other and set up WebRTC.
// Clients reach it at /peerjs.
app.use('/peerjs', ExpressPeerServer(server, { path: '/' }));

// Generates the QR code image shown on the console page
app.get('/qr.svg', async (req, res) => {
  const text = String(req.query.text || '');
  if (!text || text.length > 300) return res.status(400).end();
  try {
    res.type('image/svg+xml').send(await QRCode.toString(text, { type: 'svg', margin: 1 }));
  } catch {
    res.status(500).end();
  }
});

// PeerJS browser library, served locally so no CDN is needed
app.get('/vendor/peerjs.min.js', (req, res) =>
  res.sendFile(path.join(__dirname, 'node_modules/peerjs/dist/peerjs.min.js')));

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, '0.0.0.0', () => console.log('Running on port ' + PORT));