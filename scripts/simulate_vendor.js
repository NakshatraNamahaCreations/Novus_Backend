import io from 'socket.io-client';
import jwt from 'jsonwebtoken';

const SERVER = process.env.SERVER || 'http://localhost:3000';
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret';
const vendorId = process.env.VENDOR_ID || 'vendor-test-1';

const token = jwt.sign({ userId: vendorId, role: 'vendor' }, JWT_SECRET, { expiresIn: '7d' });

const socket = io(SERVER, {
  transports: ['websocket'],
  auth: { token },
});

socket.on('connect', () => {
  console.log('connected', socket.id);
  let lat = 12.9716, lng = 77.5946;

  setInterval(() => {
    lat += (Math.random() - 0.5) * 0.0005;
    lng += (Math.random() - 0.5) * 0.0005;
    socket.emit('vendor:location:update', { vendorId, latitude: lat, longitude: lng, accuracy: 5 });
  }, 2000);
});

socket.on('disconnect', () => console.log('disconnected'));
