#!/usr/bin/env bash
# Compiles Discord's libdave (the DAVE end-to-end encryption of voice) to
# WebAssembly, into vendor/dave/. Only needed to update libdave: the result
# is committed, and nobody installing chapterjs ever runs this.
#
# Needs Docker. Everything else (Emscripten, CMake, vcpkg, OpenSSL, mlspp)
# comes in the image or is fetched by libdave's own build, at fixed versions.
#
#   pnpm --filter chapterjs build:dave
set -euo pipefail

LIBDAVE_TAG="v1.2.1/cpp"
LIBDAVE_COMMIT="8de72b1f8a2ac3c5a5270755bb8091a62e3c6169"
EMSDK_IMAGE="emscripten/emsdk:6.0.10"

here="$(cd "$(dirname "$0")/.." && pwd)"
out="$here/vendor/dave"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# vcpkg reads its baseline from its own git history: it is cloned whole.
git clone --quiet --depth 1 --branch "$LIBDAVE_TAG" --recurse-submodules \
  https://github.com/discord/libdave "$work/libdave"
actual="$(git -C "$work/libdave" rev-parse HEAD)"
if [ "$actual" != "$LIBDAVE_COMMIT" ]; then
  echo "libdave $LIBDAVE_TAG is $actual, expected $LIBDAVE_COMMIT" >&2
  exit 1
fi

# libdave builds for browsers; chapterjs runs it in Node, and writes the
# frames it encrypts in its memory (HEAPU8).
sed -i.bak \
  -e 's/-sENVIRONMENT=web/-sENVIRONMENT=node/' \
  -e 's/EXPORTED_RUNTIME_METHODS=.\[\\"ccall\\"\]./EXPORTED_RUNTIME_METHODS=\x27[\\"ccall\\",\\"HEAPU8\\"]\x27/' \
  "$work/libdave/cpp/CMakeLists.txt"
grep -q 'HEAPU8' "$work/libdave/cpp/CMakeLists.txt" || {
  echo "Could not export HEAPU8 from libdave: its CMakeLists.txt changed." >&2
  exit 1
}

# libdave and mlspp report every message they refuse with a C++ exception,
# which Emscripten turns into an abort of the whole module unless exceptions
# are compiled in: both use WebAssembly exceptions.
sed -i.bak 's/set(OPTIMIZATION "-O3")/set(OPTIMIZATION "-O3 -fwasm-exceptions")/' \
  "$work/libdave/cpp/CMakeLists.txt"
sed -i.bak 's/set(VCPKG_CXX_FLAGS "${VCPKG_CXX_FLAGS} -s WASM=1")/set(VCPKG_CXX_FLAGS "${VCPKG_CXX_FLAGS} -s WASM=1 -fwasm-exceptions")/' \
  "$work/libdave/cpp/vcpkg-alts/wasm/overlay-ports/mlspp/portfile.cmake"
# The mlspp port of libdave installs no license: it is added.
printf '\nvcpkg_install_copyright(FILE_LIST "${SOURCE_PATH}/LICENSE")\n' \
  >> "$work/libdave/cpp/vcpkg-alts/wasm/overlay-ports/mlspp/portfile.cmake"
grep -q 'fwasm-exceptions' "$work/libdave/cpp/CMakeLists.txt" &&
  grep -q 'fwasm-exceptions' "$work/libdave/cpp/vcpkg-alts/wasm/overlay-ports/mlspp/portfile.cmake" || {
  echo "Could not turn exceptions on in libdave: its build files changed." >&2
  exit 1
}

# OpenSSL and mlspp, once compiled, are kept in a Docker volume.
docker run --rm -v "$work/libdave:/src" -v chapterjs-dave-vcpkg:/root/.cache/vcpkg \
  -w /src/cpp "$EMSDK_IMAGE" bash -c '
  set -euo pipefail
  apt-get update -qq && apt-get install -y -qq pkg-config zip unzip curl make ninja-build >/dev/null
  git config --global --add safe.directory "*"
  ./vcpkg/bootstrap-vcpkg.sh -disableMetrics
  # What `make wasm` of libdave runs, from bash: make finds a cmake of the
  # image that is not executable.
  emcmake cmake -Bbuild -DCMAKE_BUILD_TYPE=Release \
    -DVCPKG_MANIFEST_DIR=vcpkg-alts/wasm \
    -DCMAKE_TOOLCHAIN_FILE=vcpkg/scripts/buildsystems/vcpkg.cmake \
    -DVCPKG_CHAINLOAD_TOOLCHAIN_FILE="$EMSDK/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake" \
    -DVCPKG_TARGET_TRIPLET=wasm32-emscripten \
    -DCMAKE_CXX_FLAGS=-Wno-error=shorten-64-to-32
  # (In the AV1 code of libdave, which audio does not use, a 64-bit length
  # is narrowed to the 32-bit size_t of WebAssembly: a warning, not an error.)
  cmake --build build --target libdave --config Release
'

rm -rf "$out"
mkdir -p "$out"
cp "$work/libdave/cpp/build/libdave.js" "$out/libdave.mjs"
cp "$work/libdave/cpp/build/libdave.wasm" "$out/libdave.wasm"
cp "$work/libdave/cpp/build/libdave.d.ts" "$out/libdave.d.mts"
# The glue loads the .wasm next to it by its name.
sed -i.bak 's/libdave\.js/libdave.mjs/g' "$out/libdave.mjs" && rm "$out/libdave.mjs.bak"

{
  echo "libdave $LIBDAVE_TAG ($LIBDAVE_COMMIT), https://github.com/discord/libdave"
  echo "Compiled with $EMSDK_IMAGE by scripts/build-dave.sh."
  echo
  echo "=== libdave ==="
  cat "$work/libdave/LICENSE"
  for port in mlspp openssl; do
    echo
    echo "=== $port ==="
    cat "$(find "$work/libdave/cpp" -ipath "*/share/$port/copyright" | head -1)"
  done
} > "$out/LICENSE"
for part in libdave mlspp openssl; do
  grep -q "=== $part ===" "$out/LICENSE" || exit 1
done
[ "$(grep -c . "$out/LICENSE")" -gt 60 ] || {
  echo "The licenses of libdave could not be gathered." >&2
  exit 1
}

ls -l "$out"
