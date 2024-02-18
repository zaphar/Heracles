{
  inputs = {
    nixpkgs.url = "nixpkgs";
    rust-overlay = {
      url = "github:oxalica/rust-overlay?ref=stable";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    naersk.url = "github:nix-community/naersk";
    flake-compat = { url = github:edolstra/flake-compat; flake = false; };
    flake-utils.url = "github:numtide/flake-utils"; 
  };
  
  outputs = {nixpkgs, flake-utils, naersk, rust-overlay, ...}:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [
        rust-overlay.overlays.default
      ];
      pkgs = import nixpkgs { inherit system overlays; };
      rust-bin = pkgs.rust-bin.stable."1.71.0".default;
      naersk-lib = pkgs.callPackage naersk {
          rustc = rust-bin;
          cargo = rust-bin;
      };
    in
    {
      packages.default = naersk-lib.buildPackage {
          name = "heracles";
          verion = "0.0.1";
          src = ./.;
          buildInputs = (
            if pkgs.stdenv.isDarwin then
              with pkgs.darwin.apple_sdk.frameworks; [ Security SystemConfiguration ]
            else
            [ ]) ++ [rust-bin];
      };
    });
}
