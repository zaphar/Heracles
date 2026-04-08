{
  inputs = {
    nixpkgs.url = "nixpkgs";
    rust-overlay = {
      url = "github:oxalica/rust-overlay?ref=stable";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    crane.url = "github:ipetkov/crane";
    flake-compat = {
      url = "github:edolstra/flake-compat";
      flake = false;
    };
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    nixpkgs,
    flake-utils,
    crane,
    rust-overlay,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [
        rust-overlay.overlays.default
      ];
      pkgs = import nixpkgs {inherit system overlays;};
      rust-bin = pkgs.rust-bin.stable."1.87.0".default;
      craneLib = crane.mkLib pkgs;
      heracles = craneLib.buildPackage {
        name = "heracles";
        verion = "0.2.0";
        src = ./.;
        nativeBuildInputs = [pkgs.pkg-config];
        buildInputs = if pkgs.stdenv.isDarwin
            then []
            else [pkgs.openssl];
      };
    in {
      packages.default = heracles;
      formatter = pkgs.alejandra;
      devShell = craneLib.devShell {
        buildInputs = with pkgs; [ typescript cargo-tarpaulin rust-analyzer gnumake ]; 
      };
    })
    // {
      nixosModules.default = {
        config,
        pkgs,
        lib,
        ...
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
                      yaxes = [
                        {
                            tickformat = "~s";
                        }
                      ];
                      plots = [
                        {
                          source = "http://heimdall:9001";
                          query = \'\'
                            sum by (instance)(irate(node_cpu_seconds_total{job="nodestats"}[5m]))
                          \'\';
                          meta = {
                            name_function = "''${labels.instance}";
                            # yaxis to use for this plot
                            yaxis = "y";
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
