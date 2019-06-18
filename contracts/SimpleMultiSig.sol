pragma solidity ^0.5.8;

contract SimpleMultiSig {

// EIP712 Precomputed hashes:
// keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)")
bytes32 constant EIP712DOMAINTYPE_HASH = 0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472;

// kekkac256("Permiss MultiSig")
bytes32 constant NAME_HASH = 0x9773e0d7c916ed15feec0ac59e564d01cd7e20fe1f2f6c6510e865ee40fbe52f;

// kekkac256("1")
bytes32 constant VERSION_HASH = 0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6;

// kekkac256("PermissMultisigTransaction(uint256 nonce)")
bytes32 constant TXTYPE_HASH = 0x25b06799e11dd34ba11bd413631ac85a1e581c69a922f1d6fd4e1a629d013dee;

bytes32 constant SALT = 0xf8fbe39436a7340acb936b269d6776f30a0c6144bcb14456ab5cc0bcf5a30c50;

//  uint public nonce;                 // (only) mutable state
  uint public threshold;             // immutable state
  mapping (address => bool) isOwner; // immutable state
  address[] public ownersArr;        // immutable state
  uint public limit;

  bytes32 DOMAIN_SEPARATOR;          // hash for EIP712, computed from contract address
  
  // Note that owners_ must be strictly increasing, in order to prevent duplicates
  constructor(uint threshold_, address[] memory owners_, uint chainId, uint limit_) public {
    require(owners_.length <= 10 && threshold_ <= owners_.length && threshold_ > 0);

    address lastAdd = address(0);
    for (uint i = 0; i < owners_.length; i++) {
      require(owners_[i] > lastAdd);
      isOwner[owners_[i]] = true;
      lastAdd = owners_[i];
    }
    ownersArr = owners_;
    threshold = threshold_;
    limit = limit_;
    require(limit < 256, "limit must be less than 256"); // Solidity (or the EVM?) only lets a function look back a max of 256 blocks

    DOMAIN_SEPARATOR = keccak256(abi.encode(EIP712DOMAINTYPE_HASH,
                                            NAME_HASH,
                                            VERSION_HASH,
                                            chainId,
                                            this,
                                            SALT));
  }

  // Note that address recovered from signatures must be strictly increasing, in order to prevent duplicates
  // TODO: Maybe add a general `data` to the message
  function execute(uint8[] memory sigV, bytes32[] memory sigR, bytes32[] memory sigS, bytes32 recentBlockHash)
  public view returns(bool){
    require(sigR.length == threshold, "Signature length mismatch");
    require(sigR.length == sigS.length && sigR.length == sigV.length, "Signature length mismatch");

    bool success = false;

    // Message must contain a recent block hash.
    // Prevents replay attacks in this usecase.
    // Not safe for anything that mutates the chain.
    bool isRecentHash = false;
    for(uint i = 0; i < limit; i++){
      if(recentBlockHash == blockhash(block.number - i)){
        isRecentHash = true;
        break;
      }
    }
    if(!isRecentHash){return false;}

    // EIP712 scheme: https://github.com/ethereum/EIPs/blob/master/EIPS/eip-712.md
    bytes32 txInputHash = keccak256(abi.encode(TXTYPE_HASH, recentBlockHash));
    bytes32 totalHash = keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, txInputHash));

    address lastAdd = address(0); // cannot have address(0) as an owner
    for (uint i = 0; i < threshold; i++) {
      address recovered = ecrecover(totalHash, sigV[i], sigR[i], sigS[i]);
      require(recovered > lastAdd, "Signatures must be in increasing order");
      require(isOwner[recovered], "Signature is not an owner");
      lastAdd = recovered;
    }
    // If we make it here all signatures are accounted for.
    // The address.call() syntax is no longer recommended, see:
    // https://github.com/ethereum/solidity/issues/2884
    // nonce = nonce + 1;
    // TODO: Replace nonce with checks for nonce == recentBlockHash
    // bool success = false;
    // assembly { success := call(gasLimit, destination, value, add(data, 0x20), mload(data), 0, 0) }
    success = true;
    return success;
  }

  // function () payable external {}
}