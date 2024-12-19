import cors from 'cors';
import express from 'express';
import { initP2PServer } from './p2p';
import { initWallet } from './wallet';
import BlockchainController from './containers/blockchain.container';

// Set default ports or use environment variables
const HTTP_PORT = parseInt(process.env.HTTP_PORT || '3000', 10);
const P2P_PORT = parseInt(process.env.P2P_PORT || '5000', 10);

/**
 * Initializes an HTTP server that listens on a given port.
 *
 * The HTTP server has the following endpoints:
 *
 * - GET /blocks: Returns the entire blockchain as a JSON object.
 * - POST /mine: Generates a new block and adds it to the blockchain.
 *   The request body should contain a 'data' property with the block's data.
 * - GET /peers: Returns a list of connected peers as a JSON array of strings.
 * - POST /add-peer: Adds a new peer to the network.
 *   The request body should contain a 'peer' property with the peer's address.
 *
 * @param {number} httpPort The port number to listen on.
 */
const initHttpServer = (httpPort: number) => {
	const app = express();

	// Middleware
	app.use(cors());
	app.use(express.json());
	app.use(express.urlencoded({ extended: true }));

	// API Routes
	app.use('/blockchain', BlockchainController);

	// Start HTTP server
	app.listen(httpPort, () => {
		console.log(`\nHTTP server running on port ${httpPort}`);
	});
};

// Initialize servers
initHttpServer(HTTP_PORT);
initP2PServer(P2P_PORT);
initWallet();
