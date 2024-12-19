import { Block } from './block';
import sha256 from 'crypto-js/sha256';
import { hexToBinary } from './utils';
import { broadcastMessage, responseLatestMsg } from './p2p';
import { UnspentTxOut, Transaction, processTransactions } from './transaction';

let blockchain: Block[] = [];

let unspentTxOuts: UnspentTxOut[] = []; // List of unspent transaction outputs

const BLOCK_GENERATION_INTERVAL = 10; // Number of blocks to generate per interval (10 seconds)

const DIFFICULTY_ADJUSTMENT_INTERVAL = 10; // Number of blocks to adjust difficulty per interval (10 blocks)

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
		transactions: [],
		previousHash: '',
		difficulty: 0,
		proof: 0,
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
 * @param difficulty Difficulty level of PoW challenge.
 * @param proof Proof calculated by the miner.
 *
 * @returns The generated hash.
 */
const generateHash = ({
	index,
	previousHash,
	timestamp,
	transactions,
	difficulty,
	proof,
}: {
	index: number;
	previousHash: string;
	timestamp: number;
	transactions: Transaction[];
	difficulty: number;
	proof: number;
}): string => {
	return sha256(
		`${index}${previousHash}${timestamp}${transactions}${difficulty}${proof}`
	).toString();
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
		difficulty: block.difficulty,
		proof: block.proof,
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
const generateBlock = ({ transactions }: { transactions: Transaction[] }): Block => {
	const lastBlock = getLastBlock();
	const timestamp = Date.now();
	const difficulty = getDifficulty(blockchain);

	const newBlockData = {
		index: lastBlock.index + 1,
		previousHash: lastBlock.hash,
		timestamp,
		transactions,
		difficulty,
	};

	// Create the new block
	const newBlock = findBlock(newBlockData);

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

	//  Process the transactions and get the referenced unspent transaction outputs
	const referencedUTxO = processTransactions({
		transactions: newBlock.transactions,
		unspentTxOuts,
		blockIndex: newBlock.index,
	});

	// If there are no referenced unspent transaction outputs, return false
	if (referencedUTxO === null) return false;

	// Add the new block to the blockchain
	blockchain.push(newBlock);

	// Update the list of unspent transaction outputs
	unspentTxOuts = referencedUTxO;

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
		typeof block.transactions === 'object'
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

	// Validate the block timestamp
	if (!validateTimestamp(newBlock, previousBlock)) {
		console.error('\nInvalid block timestamp:', newBlock.timestamp);
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

	if (getAccumulatedDifficulty(newChain) < getAccumulatedDifficulty(blockchain)) return false;

	// Check if the new chain is longer than the current chain
	if (newChain.length <= blockchain.length) return false;

	// Replace the current chain with the new chain
	blockchain = newChain;

	// Broadcast the latest block to connected peers
	broadcastMessage(responseLatestMsg());

	return true;
};

/**
 * Checks if a given hash has a difficulty level equal to or greater than the given level.
 *
 * The difficulty level is determined by the number of leading zeros in the binary representation of the hash.
 *
 * @param {string} hash The hash to check.
 * @param {number} difficulty The difficulty level to check against.
 *
 * @returns {boolean} Whether the hash has a difficulty level equal to or greater than the given level.
 */
const checkHashDifficulty = (hash: string, difficulty: number): boolean => {
	// Convert the hash to a binary string
	const binary: string | null = hexToBinary(hash);

	// Check if the binary string starts with the required number of zeros
	const requiredPrefix: string = '0'.repeat(difficulty);

	// If no binary string is found, return false
	if (!binary) return false;

	return binary.startsWith(requiredPrefix);
};

/**
 * Determines the current difficulty level of the blockchain.
 *
 * The difficulty is adjusted every set number of blocks, based on the defined
 * `DIFFICULTY_ADJUSTMENT_INTERVAL`. If the last block's index is a multiple of
 * this interval and it is not the genesis block, the difficulty is recalculated.
 * Otherwise, the difficulty of the last block is returned.
 *
 * @param blockchain The array of blocks in the blockchain.
 *
 * @returns The current difficulty level.
 */
const getDifficulty = (blockchain: Block[]): number => {
	// Get the last block
	const lastBlock: Block = blockchain[blockchain.length - 1];

	// If the index is a multiple of 10 and not the genesis block, adjust the difficulty
	if (lastBlock.index % DIFFICULTY_ADJUSTMENT_INTERVAL === 0 && lastBlock.index !== 0) {
		return adjustDifficulty(blockchain, lastBlock);
	} else return lastBlock.difficulty;
};

/**
 * Adjusts the difficulty level of the blockchain based on the time taken to mine
 * the last set of blocks.
 *
 * The difficulty is recalculated every `DIFFICULTY_ADJUSTMENT_INTERVAL` blocks.
 * If the time taken to mine these blocks is less than half the expected time,
 * the difficulty is increased by 1. If the time taken is more than twice the
 * expected time, the difficulty is decreased by 1. Otherwise, the difficulty
 * remains the same.
 *
 * @param blockchain The array of blocks in the blockchain.
 * @param lastBlock The last block in the blockchain.
 *
 * @returns The adjusted difficulty level.
 */
const adjustDifficulty = (blockchain: Block[], lastBlock: Block): number => {
	// The last block to adjust the difficulty
	const lastAdjustmentBlock: Block =
		blockchain[blockchain.length - DIFFICULTY_ADJUSTMENT_INTERVAL];

	// Time expected to mine a block
	const timeExpected: number = BLOCK_GENERATION_INTERVAL * DIFFICULTY_ADJUSTMENT_INTERVAL;

	// Time taken to mine the last block
	const timeTaken: number = lastBlock.timestamp / 1000 - lastAdjustmentBlock.timestamp / 1000;

	// If the time taken is less than half the expected time, increase the difficulty
	if (timeTaken < timeExpected / 2) return lastAdjustmentBlock.difficulty + 1;

	// If the time taken is more than twice the expected time, decrease the difficulty
	if (timeTaken > timeExpected * 2) return lastAdjustmentBlock.difficulty - 1;

	return lastAdjustmentBlock.difficulty;
};

/**
 * Finds a valid block by trying different proofs until a valid hash is found.
 *
 * This function takes in the block data, generates a hash, and checks if the hash
 * starts with the required number of zeros. If it does, the function returns the
 * block with the valid hash. If not, the function increments the proof and tries
 * again.
 *
 * @param index The index of the block to find.
 * @param previousHash The hash of the previous block.
 * @param timestamp The timestamp of the block to find.
 * @param transactions The transactions contained in the block to find.
 * @param difficulty The difficulty level of the PoW challenge.
 *
 * @returns The block with a valid hash.
 */
const findBlock = ({
	index,
	previousHash,
	timestamp,
	transactions,
	difficulty,
}: {
	index: number;
	previousHash: string;
	timestamp: number;
	transactions: Transaction[];
	difficulty: number;
}): Block => {
	let proof = 0;

	while (true) {
		const blockData = {
			index,
			previousHash,
			transactions,
			timestamp,
			difficulty,
			proof,
		};

		// Generate the block hash
		const hash = generateHash(blockData);

		// Check if the hash starts with the required number of zeros
		if (checkHashDifficulty(hash, difficulty)) return new Block({ ...blockData, hash, proof });

		// Increment the proof
		proof++;
	}
};

/**
 * Validates the timestamp of a block.
 *
 * A block is considered to have a valid timestamp if the timestamp is within the last minute.
 *
 * @param newBlock The block to validate.
 * @param previousBlock The previous block.
 *
 * @returns Whether the timestamp is valid.
 */
const validateTimestamp = (newBlock: Block, previousBlock: Block): boolean => {
	return (
		previousBlock.timestamp - 60 < newBlock.timestamp && newBlock.timestamp - 60 < Date.now()
	);
};

/**
 * Calculates the total difficulty of all blocks in the blockchain.
 *
 * The total difficulty is the sum of 2 raised to the power of each block's difficulty.
 *
 * @param blockchain The array of blocks in the blockchain.
 *
 * @returns The total difficulty of the blockchain.
 */
const getAccumulatedDifficulty = (blockchain: Block[]): number => {
	return blockchain
		.map((block) => block.difficulty)
		.map((diffculty) => Math.pow(2, diffculty))
		.reduce((a, b) => a + b, 0);
};

export { getLastBlock, getBlockchain, addBlock, replaceChain, initializeChain, generateBlock };
