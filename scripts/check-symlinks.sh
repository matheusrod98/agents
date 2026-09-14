#!/bin/sh

# Reject tracked symlinks that dangle or resolve outside this repository.
# Guards against committing links into volatile stores (e.g. /nix/store
# home-manager files) that break when the store rotates — which is how
# rose-pine.json silently became unloadable.

set -u

repo=$(git rev-parse --show-toplevel) || exit 1
status=0

# git ls-files -s: "<mode> <hash> <stage>\t<path>" — split metadata on tab.
git ls-files -s | while IFS="	" read -r meta path; do
  mode=${meta%% *}
  test "$mode" = "120000" || continue

  if ! test -L "$path"; then
    printf 'tracked symlink missing from disk: %s\n' "$path"
    exit 1
  fi

  resolved=$(readlink -m -- "$path")
  case $resolved in
  "$repo"/*) ;;
  *)
    printf 'symlink escapes repo: %s -> %s\n' "$path" "$resolved"
    exit 1
    ;;
  esac

  if ! test -e "$path"; then
    printf 'dangling symlink: %s -> %s\n' "$path" "$(readlink -- "$path")"
    exit 1
  fi
done || status=1

exit $status
