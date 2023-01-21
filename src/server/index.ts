import { createServer } from "http";
import { Server } from "socket.io";

const PORT = 4001

const httpServer = createServer();
const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

io.on("connection", (socket) => {
    socket.on('ping', (msg) => {
        io.emit('pong', msg);
    });
});

httpServer.listen(PORT);

console.log('Listening on port', PORT)
