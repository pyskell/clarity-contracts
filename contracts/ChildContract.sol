pragma solidity >=0.5.1 <0.6.0;
import "./PermissAbstract.sol";

contract ChildContract is PermissAbstract{
    function _permitted(bytes32[] memory _permission) internal returns(bool){
        revert();
    }
    function _upgrade(bytes32[] memory _permission) internal{
        revert();
    }
    function _enable(bytes32[] memory _permission) internal returns(bool){
        revert();
    }
    function _disable(bytes32[] memory _permission) internal returns(bool){
        revert();
    }
}