{pkgs}: {
  deps = [
    pkgs.postgresql
    pkgs.imagemagickBig
    pkgs.ffmpeg-full
    pkgs.rustc
    pkgs.pkg-config
    pkgs.openssl
    pkgs.libxcrypt
    pkgs.libiconv
    pkgs.cargo
  ];
}
