import WebSocket, { WebSocketServer } from 'ws';
import { Block } from './block';
import { getLastBlock, getBlockchain, addBlock, replaceChain } from './blockchain';

const sockets: Set<WebSocket> = new Set();

enum MessageType {
	QUERY_LATEST = 0,
	QUERY_ALL = 1,
	RESPONSE_BLOCKCHAIN = 2,
}

interface Message {
	type: MessageType;
	data: any;
}

/**
 * Initializes the P2P server.
 *
 * @param p2pPort The port number to listen on.
 * @param blockchain The blockchain instance to use.
 */
const initP2PServer = (p2pPort: number) => {
	const server = new WebSocketServer({ port: p2pPort });

	server.on('connection', (socket) => {
		console.log(`New peer connected`);
		initConnection(socket);
	});

	server.on('listening', () => {
		console.log(`WebSocket P2P server running on port ${p2pPort}`);
	});

	server.on('error', (error) => {
		console.error(`WebSocket server error: ${error.message}`);
	});
};

/**
 * Retrieves the current list of active WebSocket connections.
 *
 * @returns An array of WebSocket objects representing active connections.
 */
const getSockets = (): WebSocket[] => {
	return Array.from(sockets);
};

/**
 * Initializes a new connection.
 *
 * @param socket The WebSocket connection.
 * @param blockchain The blockchain instance.
 */
const initConnection = (socket: WebSocket): void => {
	sockets.add(socket);
	console.log(`Connected peers: ${sockets.size}`);

	socket.on('message', (data) => handleMessage(socket, data.toString()));
	socket.on('close', () => closeConnection(socket));
	socket.on('error', () => closeConnection(socket));

	sendMessage(socket, queryChainLengthMsg());
};

/**
 * Closes a connection to a peer.
 *
 * @param socket The WebSocket connection to close.
 */
const closeConnection = (socket: WebSocket) => {
	console.log('Peer disconnected');
	sockets.delete(socket);
	console.log(`Remaining peers: ${sockets.size}`);
};

/**
 * Handles incoming messages from peers.
 *
 * @param socket The WebSocket connection.
 * @param rawData The raw message data.
 * @param blockchain The blockchain instance.
 */
const handleMessage = (socket: WebSocket, rawData: string) => {
	try {
		const message: Message = JSON.parse(rawData);
		console.log(`Received message: ${JSON.stringify(message)}`);

		switch (message.type) {
			case MessageType.QUERY_LATEST:
				sendMessage(socket, responseLatestMsg());
				break;
			case MessageType.QUERY_ALL:
				sendMessage(socket, responseChainMsg());
				break;
			case MessageType.RESPONSE_BLOCKCHAIN:
				handleBlockchainResponse(message.data);
				break;
			default:
				console.error(`Unknown message type: ${message.type}`);
		}
	} catch (error) {
		console.error(`Invalid message received: ${rawData}`);
	}
};

/**
 * Sends a message to a peer.
 *
 * @param socket The WebSocket connection to send the message on.
 * @param message The message to send.
 */
const sendMessage = (socket: WebSocket, message: Message) => {
	try {
		socket.send(JSON.stringify(message));
	} catch (error: Error | any) {
		console.error(`Error sending message: ${error.message}`);
	}
};

/**
 * Broadcasts a message to all connected peers.
 *
 * @param message The message to broadcast.
 */
const broadcastMessage = (message: Message) => {
	sockets.forEach((socket) => sendMessage(socket, message));
};

/**
 * Creates a message to query the latest block from a peer.
 *
 * @returns A Message object with the type set to QUERY_LATEST and data set to null.
 */
const queryChainLengthMsg = (): Message => ({
	type: MessageType.QUERY_LATEST,
	data: null,
});

const queryAllMsg = (): Message => ({
	type: MessageType.QUERY_ALL,
	data: null,
});

const responseChainMsg = (): Message => ({
	type: MessageType.RESPONSE_BLOCKCHAIN,
	data: JSON.stringify(getBlockchain()),
});

const responseLatestMsg = (): Message => ({
	type: MessageType.RESPONSE_BLOCKCHAIN,
	data: JSON.stringify([getLastBlock()]),
});

/**
 * Handles blockchain data received from a peer.
 *
 * @param data The received blockchain data.
 * @param blockchain The blockchain instance.
 */
const handleBlockchainResponse = (data: string) => {
	const receivedBlocks: Block[] | null = parseJSON<Block[]>(data);
	if (!receivedBlocks) {
		console.error(`Invalid blockchain data: ${data}`);
		return;
	}

	const latestBlockReceived = receivedBlocks[receivedBlocks.length - 1];
	const latestBlockHeld = getLastBlock();

	if (latestBlockReceived.index > latestBlockHeld.index) {
		console.log(
			`Blockchain potentially outdated. Local: ${latestBlockHeld.index}, Peer: ${latestBlockReceived.index}`
		);

		if (latestBlockHeld.hash === latestBlockReceived.previousHash) {
			if (addBlock({ newBlock: latestBlockReceived })) {
				broadcastMessage(responseLatestMsg());
			}
		} else if (receivedBlocks.length === 1) {
			console.log('Querying full chain from peer');
			broadcastMessage(queryAllMsg());
		} else {
			console.log('Replacing current chain with received chain');
			replaceChain(receivedBlocks);
		}
	} else {
		console.log('Received chain is not longer. No action taken.');
	}
};

/**
 * Establishes a connection to a peer using a WebSocket.
 *
 * @param peerUrl The URL of the peer to connect to.
 * @param blockchain The blockchain instance to use for initializing the connection.
 */
const connectToPeer = (peerUrl: string) => {
	try {
		const socket = new WebSocket(peerUrl);

		socket.on('open', () => {
			console.log(`Connected to peer: ${peerUrl}`);
			initConnection(socket);
		});

		socket.on('error', (error) => {
			console.error(`Connection error with peer ${peerUrl}: ${error.message}`);
		});
	} catch (error: Error | any) {
		console.error(`Failed to connect to peer ${peerUrl}: ${error.message}`);
	}
};

/**
 * Parses a JSON string into an object of type T.
 *
 * If the JSON is invalid, this function logs an error and returns null.
 *
 * @param data The JSON string to parse.
 *
 * @returns The parsed object, or null if an error occurred.
 *
 * @template T The type of the parsed object.
 */
const parseJSON = <T>(data: string): T | null => {
	try {
		return JSON.parse(data);
	} catch {
		console.error(`Failed to parse JSON: ${data}`);
		return null;
	}
};

export { initP2PServer, getSockets, connectToPeer, broadcastMessage, responseLatestMsg };
