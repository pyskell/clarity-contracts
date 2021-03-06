var SimpleMultiSig = artifacts.require("./SimpleMultiSig.sol")
var lightwallet = require('eth-lightwallet')

let DOMAIN_SEPARATOR
const TXTYPE_HASH = '0xa854aab0e9996164a2886405dd72fde29b74f26301bf5926ec701aeb32c619a5'
const NAME_HASH = '0x9773e0d7c916ed15feec0ac59e564d01cd7e20fe1f2f6c6510e865ee40fbe52f'
const VERSION_HASH = '0xc89efdaa54c0f20c7adf612882df0950f5a951637e0307cdcb4c672f298b8bc6'
const EIP712DOMAINTYPE_HASH = '0xd87cd6ef79d4e2b95e15ce8abf732db51ec771f1ca2edccf22a46c729ac56472'
const SALT = '0xf8fbe39436a7340acb936b269d6776f30a0c6144bcb14456ab5cc0bcf5a30c50'

const CHAINID = 5777

let latest_block
let recent_block
let old_block

contract('SimpleMultiSig', function(accounts) {

  let keyFromPw
  let acct
  let lw

  let createSigs = function(signers, multisigAddr, blockHash) {

    // FYI .slice(2) is used here to remove the 0x prefix from all but the first hash of each variable
    const domainData = EIP712DOMAINTYPE_HASH + NAME_HASH.slice(2) + VERSION_HASH.slice(2) + CHAINID.toString('16').padStart(64, '0') + multisigAddr.slice(2).padStart(64, '0') + SALT.slice(2)
    DOMAIN_SEPARATOR = web3.utils.sha3(domainData, {encoding: 'hex'})

    let txInput = TXTYPE_HASH + blockHash.slice(2)
    let txInputHash = web3.utils.sha3(txInput, {encoding: 'hex'})
    
    let input = '0x19' + '01' + DOMAIN_SEPARATOR.slice(2) + txInputHash.slice(2)
    let hash = web3.utils.sha3(input, {encoding: 'hex'})
    
    let sigV = []
    let sigR = []
    let sigS = []

    for (var i=0; i<signers.length; i++) {
      let sig = lightwallet.signing.signMsgHash(lw, keyFromPw, hash, signers[i])
      sigV.push(sig.v)
      sigR.push('0x' + sig.r.toString('hex'))
      sigS.push('0x' + sig.s.toString('hex'))
    }

    // if (signers[0] == acct[0]) {
    //   console.log("Signer: " + signers[0])
    //   console.log("Wallet address: " + multisigAddr)
    //   console.log("blockHash: " + blockHash)
    //   console.log("hash: " + hash)
    //   console.log("r: " + sigR[0])
    //   console.log("s: " + sigS[0])
    //   console.log("v: " + sigV[0])
    // }
      
    return {sigV: sigV, sigR: sigR, sigS: sigS}

  }

  let executeSendSuccess = async function(owners, threshold, signers, blockHash, done) {

    let multisig = await SimpleMultiSig.new(threshold, owners, CHAINID, 128, {from: accounts[0]})
    let msgSender = accounts[0]

    // check that owners are stored correctly
    for (var i=0; i<owners.length; i++) {
      let ownerFromContract = await multisig.ownersArr.call(i)
      assert.equal(owners[i].toLowerCase(), ownerFromContract.toLowerCase())
    }

    let sigs = createSigs(signers, multisig.address, blockHash)

    await multisig.permitted(sigs.sigV, sigs.sigR, sigs.sigS, blockHash, {from: msgSender}).then(result => assert.isTrue(result))

    ///////////////////////////////////////////////////////////////////////////

    // TODO: Make sure the below works.

    // Test contract interactions
    // let reg = await TestRegistry.new({from: accounts[0]})

    // let number = 12345
    // let data = lightwallet.txutils._encodeFunctionTxData('register', ['uint256'], [number])

    // sigs = createSigs(signers, multisig.address, recent_block.hash)
    // await multisig.execute(sigs.sigV, sigs.sigR, sigs.sigS, reg.address, value, data, executor, 100000, {from: msgSender, gasLimit: 1000000})

    // // Check that number has been set in registry
    // let numFromRegistry = await reg.registry(multisig.address)
    // assert.equal(numFromRegistry.toNumber(), number)

    // // Check funds in registry
    // bal = await web3GetBalance(reg.address)
    // assert.equal(bal.toString(), value.toString())

    // // Check nonce updated
    // nonce = await multisig.nonce.call()
    // assert.equal(nonce.toNumber(), 3)

    done()
  }

  let executeSendFailure = async function(owners, threshold, signers, blockHash, done) {

    let multisig = await SimpleMultiSig.new(threshold, owners, CHAINID, 128, {from: accounts[0]})
    let msgSender = accounts[0]

    let sigs = createSigs(signers, multisig.address, blockHash)

    await multisig.permitted(sigs.sigV, sigs.sigR, sigs.sigS, blockHash, {from: msgSender}).then(result => assert.isFalse(result))

    done()
  }

  let creationFailure = async function(owners, threshold, blockDepthLimit, reason, done) {

    try {
      await SimpleMultiSig.new(threshold, owners, CHAINID, blockDepthLimit, {from: accounts[0]})
    }
    catch(error) {
      errMsg = error.message
    }

    assert.equal(errMsg, reason, 'Test did not throw')

    done()
  }
  
  before((done) => {

    let seed = "sting arrive festival trick chapter reward animal whip client alley twice lottery"

    lightwallet.keystore.createVault(
    {hdPathString: "m/44'/60'/0'/0",
     seedPhrase: seed,
     password: "test",
     salt: "testsalt"
    },
    function (err, keystore) {
      lw = keystore
      lw.keyFromPassword("test", function(e,k) {
        keyFromPw = k

        lw.generateNewAddress(keyFromPw, 20)
        let acctWithout0x = lw.getAddresses()
        acct = acctWithout0x.map((a) => {return a})
        acct.sort()
        done()
      })
    })
  })

  beforeEach(async function(){
    // TODO: If our test blockchain has <50 blocks then this won't work.
    // Need to check for this and get the test chain to "mine" >50 blocks if that's the case.
    latest_block = await web3.eth.getBlock("latest");
    recent_block = await web3.eth.getBlock(latest_block.number - 10);
    old_block = await web3.eth.getBlock(latest_block.number - 180);
  })

  describe("3 signers, threshold 2", () => {

    it("should succeed with signers 0, 1", (done) => {
      let signers = [acct[0], acct[1]]
      signers.sort()
      executeSendSuccess(acct.slice(0,3), 2, signers, recent_block.hash, done)
    })

    it("should succeed with signers 0, 2", (done) => {
      let signers = [acct[0], acct[2]]
      signers.sort()
      executeSendSuccess(acct.slice(0,3), 2, signers, recent_block.hash, done)
    })

    it("should succeed with signers 1, 2", (done) => {
      let signers = [acct[1], acct[2]]
      signers.sort()
      executeSendSuccess(acct.slice(0,3), 2, signers, recent_block.hash, done)
    })

    it("should fail due to non-owner signer", (done) => {
      let signers = [acct[0], acct[3]]
      signers.sort()
      executeSendFailure(acct.slice(0,3), 2, signers, recent_block.hash, done)
    })

    it("should fail with more signers than threshold", (done) => {
      executeSendFailure(acct.slice(0,3), 2, acct.slice(0,3), recent_block.hash, done)
    })

    it("should fail with fewer signers than threshold", (done) => {
      executeSendFailure(acct.slice(0,3), 2, [acct[0]], recent_block.hash, done)
    })

    it("should fail with one signer signing twice", (done) => {
      executeSendFailure(acct.slice(0,3), 2, [acct[0], acct[0]], recent_block.hash, done)
    })

    it("should fail with signers in wrong order", (done) => {
      let signers = [acct[0], acct[1]]
      signers.sort().reverse() //opposite order it should be
      executeSendFailure(acct.slice(0,3), 2, signers, recent_block.hash, done)
    })

    it("should fail with old blockHash", (done) => {
      let signers = [acct[0], acct[1]]
      signers.sort()
      executeSendFailure(acct.slice(0,3), 2, signers, old_block.hash, done)
    })
    
  })  

  describe("Edge cases", () => {
    it("should succeed with 10 owners, 10 signers", (done) => {
      executeSendSuccess(acct.slice(0,10), 10, acct.slice(0,10), recent_block.hash, done)
    })

    it("should fail to create with signers 0, 0, 2, and threshold 3", (done) => { 
      let expectedReason = "Returned error: VM Exception while processing transaction: revert owners_ must be in ascending/increasing order -- Reason given: owners_ must be in ascending/increasing order."
      creationFailure([acct[0],acct[0],acct[2]], 3, 128, expectedReason, done)
    })

    it("should fail with 0 signers", (done) => {
      executeSendFailure(acct.slice(0,3), 2, [], recent_block.hash, done)
    })

    it("should fail with 11 owners", (done) => {
      let expectedReason = "Returned error: VM Exception while processing transaction: revert"
      creationFailure(acct.slice(0,11), 2, 128, expectedReason, done)
    })

    it("should fail with too high of a blockDepthLimit", (done) =>{
      let expectedReason = "Returned error: VM Exception while processing transaction: revert blockDepthLimit must be less than 256 -- Reason given: blockDepthLimit must be less than 256."
      creationFailure(acct.slice(0,3), 2, 256, expectedReason, done)
    })
  })

  describe("Hash constants", () => {
    it("uses correct hash for EIP712DOMAINTYPE", (done) => {
      const eip712DomainType = 'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)'
      assert.equal(web3.utils.sha3(eip712DomainType), EIP712DOMAINTYPE_HASH)
      done()
    })

    it("uses correct hash for NAME", (done) => {
      assert.equal(web3.utils.sha3('Permiss MultiSig'), NAME_HASH)
      done()
    })

    it("uses correct hash for VERSION", (done) => {
      assert.equal(web3.utils.sha3('1'), VERSION_HASH)
      done()
    })

    it("uses correct hash for PERMISSMULTISIGTX", (done) => {
      const multiSigTxType = 'PermissMultisigTransaction(bytes32 recentBlockHash)'
      assert.equal(web3.utils.sha3(multiSigTxType), TXTYPE_HASH)
      done()
    })
  })

  // TODO: Maybe support MetaMask, prefer to have custom-rolled interfaces
  // describe("Browser MetaMask test", () => {
  //   it("Matches the signature from MetaMask", (done) => {

  //     // To test in MetaMask:
  //     //
  //     // Import the following private key in MetaMask:
  //     // 92525a72c0af73fc68bd2d759a082b797e8c7e638e2fd7371e77c503b957f4b1
  //     // It should give the address:
  //     // 0x9d42A32ba574D25d2bd6cc002a5d54a424Cdb55d
  //     //
  //     // Make sure you are on Mainnet with the above account
  //     // Load the HTML page located at
  //     // browsertest/index.html
  //     // and click "Sign data" (using the default values).
  //     // You should see the signature values r,s,v below:

  //     const mmSigR = '0x91a622ccbd1c65debc16cfa1761b6200acc42099a19d753c7c59ceb12a8f5cfc'
  //     const mmSigS = '0x6814fae69a6cc506b11adf971ca233fbcdbdca312ab96a58eb6b6b6792771fd4'
  //     const mmSigV = 27

  //     const walletAddress = '0xe3de7de481cbde9b4d5f62c6d228ec62277560c8'
  //     const signers = [acct[0]]

  //     let sigs = createSigs(signers, walletAddress, recent_block.hash)
      
  //     assert.equal(sigs.sigR[0], mmSigR)
  //     assert.equal(sigs.sigS[0], mmSigS)
  //     assert.equal(sigs.sigV[0], mmSigV)
      
  //     done()
  //   })
  // })

})
