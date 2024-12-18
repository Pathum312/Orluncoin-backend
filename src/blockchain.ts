import { Block } from './block';
import sha256 from 'crypto-js/sha256';
import { broadcastMessage, responseLatestMsg } from './p2p';

let blockchain: Block[] = [];

/**
 * Initializes the blockchain by adding the genesis block to the chain.
 */
const initializeChain = () => {
	blockchain.push(createGenesisBlock()); // Add the genesis block to the chain
};

/**
 * Creates the genesis block of the blockchain.
 *
 * @returns The genesis block.
 */
const createGenesisBlock = (): Block => {
	const timestamp = Date.now();

	const genesisData = {
		index: 0,
		timestamp,
		transactions: '',
		previousHash: '',
	};

	// Create and return the genesis block
	return new Block({
		...genesisData,
		hash: generateHash(genesisData),
	});
};

/**
 * Generates a hash based on the given block data.
 *
 * @param index Unique identifier of the block.
 * @param previousHash Hash of the previous block.
 * @param timestamp Time of block creation.
 * @param transactions List of transactions contained in the block.
 *
 * @returns The generated hash.
 */
const generateHash = ({
	index,
	previousHash,
	timestamp,
	transactions,
}: {
	index: number;
	previousHash: string;
	timestamp: number;
	transactions: string;
}): string => {
	return sha256(`${index}${previousHash}${timestamp}${transactions}`).toString();
};

/**
 * Generates a hash for a given block.
 *
 * @param block The block object to generate a hash for.
 *
 * @returns The generated hash.
 */
const generateHashForBlock = ({ block }: { block: Block }): string => {
	return generateHash({
		index: block.index,
		previousHash: block.previousHash,
		timestamp: block.timestamp,
		transactions: block.transactions,
	});
};

/**
 * Retrieves the entire blockchain as an array of blocks.
 *
 * @returns An array of all blocks in the blockchain.
 */
const getBlockchain = (): Block[] => {
	return [...blockchain];
};

/**
 * Retrieves the last block in the blockchain.
 *
 * @returns The last block in the blockchain.
 */
const getLastBlock = (): Block => {
	return blockchain[blockchain.length - 1];
};

/**
 * Generates a new block and adds it to the blockchain.
 *
 * @param transactions The transactions to include in the new block.
 *
 * @returns The newly generated block.
 */
const generateBlock = ({ transactions }: { transactions: string }): Block => {
	const lastBlock = getLastBlock();
	const timestamp = Date.now();

	const newBlockData = {
		index: lastBlock.index + 1,
		previousHash: lastBlock.hash,
		timestamp,
		transactions,
	};

	// Create the new block
	const newBlock = new Block({
		...newBlockData,
		hash: generateHash(newBlockData),
	});

	// Add the new block to the blockchain
	if (!addBlock({ newBlock })) console.error('\nFailed to generate block');

	// Broadcast the latest block to connected peers
	broadcastMessage(responseLatestMsg());

	return newBlock;
};

/**
 * Adds a new block to the blockchain.
 *
 * @param newBlock The block to add.
 *
 * @returns Whether the block was successfully added.
 */
const addBlock = ({ newBlock }: { newBlock: Block }): boolean => {
	// Validate the new block structure and data
	if (!validateNewBlock({ newBlock, previousBlock: getLastBlock() })) return false;

	// Add the new block to the blockchain
	blockchain.push(newBlock);

	return true;
};

/**
 * Validates the structure of a block.
 *
 * A block is considered to have a valid structure if it has the following properties:
 * - index: a number
 * - hash: a string
 * - previousHash: a string
 * - timestamp: a number
 * - transactions: a string
 *
 * @param {Object} block The block to validate.
 *
 * @returns {boolean} Whether the block has a valid structure.
 */
const validateBlockStructure = ({ block }: { block: Block }): boolean => {
	return (
		typeof block.index === 'number' &&
		typeof block.hash === 'string' &&
		typeof block.previousHash === 'string' &&
		typeof block.timestamp === 'number' &&
		typeof block.transactions === 'string'
	);
};

/**
 * Validates a new block.
 *
 * A new block is considered to be valid if it has a valid structure, its index is one greater than the previous block,
 * its previous hash matches the hash of the previous block, and its hash is correct.
 *
 * @param {Object} newBlock The block to validate.
 * @param {Object} previousBlock The previous block.
 *
 * @returns {boolean} Whether the block is valid.
 */
const validateNewBlock = ({
	newBlock,
	previousBlock,
}: {
	newBlock: Block;
	previousBlock: Block;
}): boolean => {
	// Validate the block structure
	if (!validateBlockStructure({ block: newBlock })) {
		console.error('\nInvalid block structure:', newBlock);
		return false;
	}

	// Validate the block index
	if (newBlock.index !== previousBlock.index + 1) {
		console.error(
			`\nInvalid block index. Expected: ${previousBlock.index + 1}, Found: ${newBlock.index}`
		);
		return false;
	}

	// Validate the previous hash
	if (newBlock.previousHash !== previousBlock.hash) {
		console.error('\nInvalid previous hash:', newBlock.previousHash);
		return false;
	}

	// Validate the block hash
	if (generateHashForBlock({ block: newBlock }) !== newBlock.hash) {
		console.error('\nInvalid block hash:', newBlock.hash);
		return false;
	}

	return true;
};

/**
 * Validates the entire blockchain.
 *
 * The blockchain is considered to be valid if every block is valid and the hashes between blocks are correct.
 *
 * @returns {boolean} Whether the blockchain is valid.
 */
const validateChain = (): boolean => {
	for (let i = 1; i < blockchain.length; i++) {
		// Validate each block in the blockchain
		if (
			!validateNewBlock({
				newBlock: blockchain[i],
				previousBlock: blockchain[i - 1],
			})
		) {
			return false;
		}
	}

	return true;
};

/**
 * Replaces the current blockchain with a new one.
 *
 * This function can be used to update the blockchain to a longer chain.
 *
 * @param {Block[]} newChain The new blockchain.
 *
 * @returns {boolean} Whether the replacement was successful.
 */
const replaceChain = (newChain: Block[]): boolean => {
	// Check if the new chain is valid
	if (!validateChain()) return false;

	// Check if the new chain is longer than the current chain
	if (newChain.length <= blockchain.length) return false;

	// Replace the current chain with the new chain
	blockchain = newChain;

	return true;
};

export { getLastBlock, getBlockchain, addBlock, replaceChain, initializeChain, generateBlock };
