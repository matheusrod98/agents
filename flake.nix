{
  description = "Runtime environment for open-computer-use on NixOS (Python/PyGObject + AT-SPI/GTK typelibs).";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    {
      self,
      nixpkgs,
    }:
    let
      pkgs = nixpkgs.legacyPackages.x86_64-linux;
      # The open-computer-use Linux runtime is a Go binary that embeds a
      # Python script (runtime.py) and executes it with `python3` from PATH.
      # The script imports gi (PyGObject) with the Atspi namespace, so the
      # plain system python3 is not enough on NixOS.
      pythonEnv = pkgs.python3.withPackages (ps: [ ps.pygobject3 ]);
      typelibs = with pkgs; [ gtk3 at-spi2-core gdk-pixbuf gobject-introspection glib dbus-glib ];
    in
    {
      packages.x86_64-linux.open-computer-use-runtime-env = pkgs.runCommand "open-computer-use-runtime-env" { } ''
        mkdir -p "$out/bin"
        cat > "$out/activate" <<EOF
        export PATH="${pythonEnv}/bin:\$PATH"
        export GI_TYPELIB_PATH="${pkgs.lib.makeSearchPath "lib/girepository-1.0" typelibs}"
        EOF
        cat > "$out/bin/at-spi-bus-launcher" <<EOF
        #!/bin/sh
        exec "${pkgs.at-spi2-core}/libexec/at-spi-bus-launcher" "\$@"
        EOF
        chmod +x "$out/bin/at-spi-bus-launcher"
      '';

      packages.x86_64-linux.default = self.packages.x86_64-linux.open-computer-use-runtime-env;
    };
}
