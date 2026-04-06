import { GroupEncryption as CryptoGroupEncryption } from './crypto/group-encryption';
import { GroupKey } from './crypto/group-key';

/**
 * Backwards-compatible alias used by older imports.
 * Uses the in-repo crypto implementation to avoid external package drift.
 */
class GroupEncryption extends CryptoGroupEncryption {
    constructor(key: GroupKey) {
        super(key);
    }
}

export default GroupEncryption;
