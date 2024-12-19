import { Transaction } from './transaction';

class Block {
	public index: number; // Block ID
	public timestamp: number; // Time of block creation
	public transactions: Transaction[]; // List of transactions
	public hash: string; // Hash of the block
	public previousHash: string; // Hash of the previous block
	public difficulty: number; // Difficulty level of PoW challenge
	public proof: number; // Proof calculated by the miner

	/**
	 * Create a new block
	 *
	 * @param index Unique identifier of the block
	 * @param timestamp Time of block creation
	 * @param transactions List of transactions contained in the block
	 * @param hash Hash of the block
	 * @param previousHash Hash of the previous block
	 * @param difficulty Difficulty level of PoW challenge
	 * @param proof Proof calculated by the miner
	 */
	constructor({ index, timestamp, transactions, hash, previousHash, difficulty, proof }: Block) {
		this.index = index;
		this.timestamp = timestamp;
		this.transactions = transactions;
		this.hash = hash;
		this.previousHash = previousHash;
		this.difficulty = difficulty;
		this.proof = proof;
	}
}

export { Block };
