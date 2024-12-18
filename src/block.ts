class Block {
	public index: number; // Block ID
	public timestamp: number; // Time of block creation
	public transactions: string; // List of transactions
	public hash: string; // Hash of the block
	public previousHash: string; // Hash of the previous block

	/**
	 * Create a new block
	 *
	 * @param index Unique identifier of the block
	 * @param timestamp Time of block creation
	 * @param transactions List of transactions contained in the block
	 * @param hash Hash of the block
	 * @param previousHash Hash of the previous block
	 */
	constructor({ index, timestamp, transactions, hash, previousHash }: Block) {
		this.index = index;
		this.timestamp = timestamp;
		this.transactions = transactions;
		this.hash = hash;
		this.previousHash = previousHash;
	}
}

export { Block };
