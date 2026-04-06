export class GroupKey {
    private key: Buffer;
    
    constructor(key: Buffer) {
        this.key = key;
    }
    
    getKey(): Buffer {
        return this.key;
    }
    
    setKey(key: Buffer): void {
        this.key = key;
    }
}