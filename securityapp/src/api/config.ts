/**
 * Global API Configuration
 * Set ENABLE_API_CALLS to true to enable all API calls and use real backend data
 */
export const ENABLE_API_CALLS = true; // Enabled for local development

// Replace with your real Render URL, include the protocol
// Deployed backend URL: https://safetnet.onrender.com
// Local development URL: http://localhost:8000 (for emulator/simulator only)
// Using deployed backend for production
// const BACKEND_BASE_URL = 'https://safetnet-backend-1.onrender.com';
const BACKEND_BASE_URL = 'http://10.0.2.2:8000'; // Local backend for emulator

export default {
  BASE_URL: BACKEND_BASE_URL,
};