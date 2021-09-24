import WebSocket from 'ws'

const socket = new WebSocket('http://localhost:31300', { handshakeTimeout: 5000 })

socket.onerror = (error: WebSocket.ErrorEvent) => {
  console.log('error', error)
}

socket.close = (code?: number, data?: string) => {
  console.log('socket.close:', code, data)
}

socket.onmessage = (event) => {
  console.log(event.data)
}

const payload = {
  method: 'subscribe',
  topic: 'txs',
  data: { address: '0x6bF198c2B5c8E48Af4e876bc2173175b89b1DA0C' },
}

socket.onopen = () => {
  socket.send(JSON.stringify(payload))
}
