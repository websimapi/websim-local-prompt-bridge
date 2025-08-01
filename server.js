const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const puppeteer = require('puppeteer');
const open = require('open');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let browser = null;
let page = null;
let isWebsimReady = false;
let connectedClients = 0;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  return 'localhost';
}

// Initialize Puppeteer and open websim.com
async function initializeWebsim() {
  try {
    console.log('🚀 Starting browser automation...');
    browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    page = await browser.newPage();
    await page.goto('https://websim.ai', { waitUntil: 'networkidle0' });
    
    // Wait for the page to load and check if prompt input exists
    try {
      await page.waitForSelector('input[placeholder*="prompt"], textarea[placeholder*="prompt"], input[type="text"]', { timeout: 10000 });
      isWebsimReady = true;
      console.log('✅ Websim.ai loaded successfully');
      io.emit('websim-status', { ready: true, message: 'Connected to websim.ai' });
    } catch (error) {
      console.log('⚠️ Prompt input not found, but page loaded');
      isWebsimReady = false;
      io.emit('websim-status', { ready: false, message: 'Page loaded but prompt input not detected' });
    }
  } catch (error) {
    console.error('❌ Error initializing websim:', error.message);
    isWebsimReady = false;
    io.emit('websim-status', { ready: false, message: 'Failed to connect to websim.ai' });
  }
}

// Send prompt to websim
async function sendPromptToWebsim(prompt) {
  if (!page || !isWebsimReady) {
    throw new Error('Websim not ready');
  }

  try {
    // Try multiple possible selectors for the prompt input
    const selectors = [
      'input[placeholder*="prompt"]',
      'textarea[placeholder*="prompt"]', 
      'input[type="text"]',
      'textarea',
      '.prompt-input',
      '[data-testid="prompt-input"]'
    ];

    let inputFound = false;
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 2000 });
        await page.click(selector);
        await page.type(selector, prompt);
        
        // Try to submit (look for submit button or press Enter)
        try {
          const submitButton = await page.$('button[type="submit"], .submit-btn, button:has-text("Generate")');
          if (submitButton) {
            await submitButton.click();
          } else {
            await page.keyboard.press('Enter');
          }
        } catch (submitError) {
          await page.keyboard.press('Enter');
        }
        
        inputFound = true;
        break;
      } catch (selectorError) {
        continue;
      }
    }

    if (!inputFound) {
      throw new Error('Could not find prompt input field');
    }

    return { success: true, message: 'Prompt sent successfully' };
  } catch (error) {
    console.error('Error sending prompt:', error.message);
    throw error;
  }
}

// Socket.io connection handling
io.on('connection', (socket) => {
  connectedClients++;
  console.log(`📱 Client connected. Total clients: ${connectedClients}`);
  
  // Send current status to new client
  socket.emit('websim-status', { 
    ready: isWebsimReady, 
    message: isWebsimReady ? 'Connected to websim.ai' : 'Connecting to websim.ai...' 
  });
  
  socket.emit('server-info', {
    ip: getLocalIP(),
    port: PORT,
    clients: connectedClients
  });

  socket.on('send-prompt', async (data) => {
    console.log(`📝 Received prompt: ${data.prompt}`);
    try {
      const result = await sendPromptToWebsim(data.prompt);
      socket.emit('prompt-result', { success: true, message: result.message });
      io.emit('prompt-sent', { prompt: data.prompt, timestamp: new Date().toISOString() });
    } catch (error) {
      socket.emit('prompt-result', { success: false, message: error.message });
    }
  });

  socket.on('disconnect', () => {
    connectedClients--;
    console.log(`📱 Client disconnected. Total clients: ${connectedClients}`);
    io.emit('client-count', connectedClients);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log('\n🌐 Local Prompt Bridge Server Started!');
  console.log('==========================================');
  console.log(`🖥️  Desktop: http://localhost:${PORT}`);
  console.log(`📱 Mobile: http://${localIP}:${PORT}`);
  console.log('==========================================\n');
  
  // Initialize websim after server starts
  initializeWebsim();
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

