{
  inputs = {
    nixpkgs.url = "nixpkgs";
    rust-overlay = {
      url = "github:oxalica/rust-overlay?ref=stable";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    naersk.url = "github:nix-community/naersk";
    flake-compat = {
      url = github:edolstra/flake-compat;
      flake = false;
    };
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    nixpkgs,
    flake-utils,
    naersk,
    rust-overlay,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [
        rust-overlay.overlays.default
      ];
      pkgs = import nixpkgs {inherit system overlays;};
      rust-bin = pkgs.rust-bin.stable."1.71.0".default;
      naersk-lib = pkgs.callPackage naersk {
        rustc = rust-bin;
        cargo = rust-bin;
      };
      heracles = naersk-lib.buildPackage {
        name = "heracles";
        verion = "0.0.1";
        src = ./.;
        nativeBuildInputs = [pkgs.pkg-config];
        buildInputs =
          (
            if pkgs.stdenv.isDarwin
            then with pkgs.darwin.apple_sdk.frameworks; [Security SystemConfiguration]
            else [pkgs.openssl]
          )
          ++ [rust-bin];
      };
    in {
      packages.default = heracles;
      formatter = pkgs.alejandra;
    })
    // {
      nixosModules.default = {
        config,
        pkgs,
        lib,
      }: {
        options = {
          services.heracles.enable = lib.mkEnableOption "enable heracles service";
          services.heracles.listen = lib.mkOption {
            description = "[host]:port address for heracles to listen on";
            default = "localhost:8080";
            defaultText = "localhost:8080";
            type = lib.types.string;
          };

          services.heracles.settings = lib.mkOption {
            description = "heracles dashboard Configuration";
            type = lib.types.listOf lib.types.attrs;
            default = [];
            defaultText = lib.literalExpression ''
              [
                {
                  title = "A dashboard";
                  graphs = [
                    {
                      title = "Graph title";
                      query_type = "Range";
                      # yaxis formatting default for this graph
                      d3_tick_format = "~s";
                      plots = [
                        {
                          source = "http://heimdall:9001";
                          query = \'\'
                            sum by (instance)(irate(node_cpu_seconds_total{job="nodestats"}[5m]))
                          \'\';
                          meta = {
                            name_function = "''${labels.instance}";
                            named_axis = "y";
                            # yaxis formatting for this subplot
                            d3_tick_format = "~s";
                          };
                        }
                      ];
                      # span for this graph.
                      span = {
                        end = "now";
                        duration = "1d";
                        step_duration = "10min";
                      };
                    }
                  ];
                  # default span for dashboard
                  span = {
                    end = "now";
                    duration = "1d";
                    step_duration = "10min";
                  };
                }
              ]
            '';
          };
        };

        config = let
          cfg = config.services.heracles;
          cfgFile = pkgs.writeText "heracles.yaml" (builtins.toJSON cfg.settings);
        in
          lib.mkIf cfg.enable {
            systemd.services.heracles = {
              wantedBy = ["multi-user.target" "default.target"];
              wants = ["network.target"];
              after = ["network-online.target"];
              serviceConfig = {
                Restart = "on-failure";
                RestartSec = "30s";
                ExecStart = "${pkgs.heracles}/bin/heracles --listen ${cfg.listen} --config=${cfgFile}";
              };
            };
          };
      };
    };
}
