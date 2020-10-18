#!/bin/bash -u

BASE_DIR=$(cd $(dirname "$0") && pwd -P)
SCRIPT_NAME=$(basename "$0")

# must be biggest to smallest to minimize parsing by the UI
BP_SIZES=(1600 480 240)
BP_NAMES=(large small tiny)
BP_QUALITY=(92 85 70)

# TODO:
# - handle errors (e.g. invalid image) cleaner
# - write out json file w/ images progressively
# - ensure we don't clobber key files (e.g. json file) during run


usage() {
    cat <<EOI
Usage: $SCRIPT_NAME [ARGS] IMAGE_DIR SITE_ROOT SITE_TITLE [MATCH_FILE]

Generate a static website based on the images in the directory specified.

Recursively scans SRC_DIR to extract all JPG images and creates sized-down (and
properly oriented) web-friendly versions for display and download.

ARGS

    -d|--dry-run          Run without making any changes
    -f|--force[N]         Force regenerate image files if they exist; n=BP index
    -m|--music DIR        Create a playlist based on the songs in DIR (repeatable)
    -h|--help             This information
    -s|--site-only        Generate site files only; skip image processing
    -v|--verbose          Print debugging information to stdout
    MATCH_FILE            Only process the files matching the string given


EXAMPLES:

  ./$SCRIPT_NAME -v ~/uploads ~/www/public/

  1. Create resized, oriented images for each source image:

    ~uploads/              ->   ~/www/public/images/dist/uploads
    - me.jpg               ->   me_large.jpg, me_small.jpg
    - us.JPG               ->   us_large.jpg, us_small.jpg
    - cool place/          ->   cool place/
      - me.jpeg            ->     - me_large.jpg, me_small.jpg
      - everyone.jpg       ->     - everyone_large.jpg, everyone_small.jpg
      - cooler sub-place/  ->     - cooler sub-place/
        - you.JPEG         ->       - you_large.jpg, you_small.jpg

  2. Generates html/css/js files in the web root

    ~/www/public/
    - index.html          # main website page
    - images/dist/        # images as per above
    - images/masters/     # symlink to original files for download
    - js/gallery.js       # javascript for the image gallery code
    - css/
      - gallery.css       # default styling
      - theme.css         # custome overrides
EOI
}

fail() {
    echo "$@" >&2
    exit 1
}

rem() {
    echo "+ [$@]" >&2
}

cmd() {
    if [ $DRYRUN -eq 1 ]; then
        echo -e "\033[0;33;40m# $(printf "'%s' " "$@")\033[0;0m" >&2
    else
        [ $VERBOSE -eq 1 ] \
            && echo -e "\033[0;33;40m# $(printf "'%s' " "$@")\033[0;0m" >&2
        "$@"
    fi
}


# collect and validate args
# ==========================================

[ $# -ge 3 ] || {
    usage
    fail "Missing one or more arguments"
}

SRC_DIR=
SITE_ROOT=
SITE_TITLE=
MATCH_FILE=
DRYRUN=0
VERBOSE=0
FORCE=0
FORCE_BP=
SITE_ONLY=0
MUSIC_DIRS=()

while [ $# -gt 0 ]; do
    arg="$1"
    shift
    case "$arg" in 
        --dry-run|-d)
            DRYRUN=1
            ;;
        --verbose|-v)
            VERBOSE=1
            ;;
        --force*|-f*)
            FORCE=1
            ;;
        --music|-m)
            [ $# -gt 0 ] || fail "Missing arg to --music|-m"
            MUSIC_DIRS+=("$(cd "$1" && pwd -P)")
            shift
            ;;
        --site-only|-s)
            SITE_ONLY=1
            ;;
        --help|-h)
            usage
            exit
            ;;
        *)
            if [ -z "$SRC_DIR" ]; then
                SRC_DIR="$arg"
            elif [ -z "$SITE_ROOT" ]; then
                SITE_ROOT=$(builtin cd "$arg" && pwd -P)
            elif [ -z "$SITE_TITLE" ]; then
                SITE_TITLE="$arg"
            else
                [ -n "$MATCH_FILE" ] && fail "Match of '$MATCH_FILE' already given; invalid arg: $arg"
                MATCH_FILE="$arg"
            fi
            ;;
    esac
done


[ -d "$SRC_DIR" ] || fail "Can't find image source dir: $SRC_DIR"
[ -n "$SITE_ROOT" ] || fail "No site root directory given"
[ -d "$SITE_ROOT" ] || fail "Can't find site root dir: $SITE_ROOT"
which convert &>/dev/null || fail "Can't find 'convert' binary from ImageMagick"
rem "SRC=$SRC_DIR, SITE_ROOT=$SITE_ROOT"


# main logic
# ==========================================

declare dir_name
declare file_name
declare orientation
declare dest_file
declare size
declare size_name
declare commaa
declare i
declare -a convert_args

[ $SITE_ONLY -eq 0 ] && {
    [ $DRYRUN -eq 1 ] \
        && images_file=/dev/null \
        || images_file="$SITE_ROOT/images.json"

    rem "Generating images; this may take a while..."
    cd "$SRC_DIR" || fail "failed to CD to src dir"
    {
        echo "{\"images\": ["
        find . -iname \*.jpg -o -iname \*.jpeg \
            | sed 's/^\.\///' \
            | while read img; do
            dir_name=$(dirname "$img")
            file_name=$(basename "${img%.*}")
            # skip to only certain images
            [ -n "$MATCH_FILE" -a "${file_name//$MATCH_FILE/}" = "$file_name" ] && continue

            # get the orientation to auto-correct
            #orientation=$(identify -format '%[EXIF:*]' "$img" \
            #    | awk -F= '$1 == "exif:Orientation" {print $2}')
            #if [ "$orientation" = "1" -o "$orientation" = '' ]; then
            #    echo "Copying over '$img' verbatum"
            #    cp -f "$img" "../$SITE_ROOT/images/$img" &>/dev/null
            #else
            #    rem "'$img' needs auto-orientation"
            #    convert "$img" -auto-orient "../$SITE_ROOT/images/$img"
            #fi
            
            # for each breakpoint, generate images
            echo "  {\"name\": \"$dir_name/$file_name\", \"files\": ["
            for ((i=0; i<${#BP_SIZES[*]}; i++)); do
                mkdir -p "$SITE_ROOT/images/dist/$dir_name" \
                    || fail "Failed to create '$SITE_ROOT/images/dist/$dir_name'"
                size=${BP_SIZES[i]}
                size_name=${BP_NAMES[i]}
                dest_file="$SITE_ROOT/images/dist/$dir_name/${file_name}_${size_name}.jpg"
                convert_args=(
                    "$SRC_DIR/$img"
                    -auto-orient
                    -quality ${BP_QUALITY[i]}
                    -resize "$size>"
                    "$dest_file"
                )
                [ -s "$dest_file" -a $FORCE -eq 0 ] && {
                    rem "  Skipping; '$dest_file' already exists"
                } ||  {
                    cmd convert "${convert_args[@]}" || fail "Failed to process $img ($size_name=$size)"
                    [ $DRYRUN -eq 0 ] && rem "  Generated '$dest_file'"
                }
                [ $((i + 1)) = ${#BP_SIZES[*]} ] && comma='' || comma=','
                echo "    {\"size\": $size, \"sizeName\": \"$size_name\", \"src\": \"${dest_file##$SITE_ROOT/}\"}$comma"
            done
            echo "  ]},"
            # : trim trailing comma on last list item
        done | sed '$s/,//'
        echo "]}"
    } > "$images_file" || fail "Failed to generate images or write $images_file"

    [ ${#MUSIC_DIRS[*]} -gt 0 ] && {
        rem "Generating playlist"
        [ $DRYRUN -eq 1 ] \
            && music_file=/dev/null \
            || music_file="$SITE_ROOT/music.json"
        {
            mkdir -p "$SITE_ROOT/music/" || fail "Failed to create '$SITE_ROOT/music/'"
            echo "{\"music\": ["
            first=1
            for music_dir in "${MUSIC_DIRS[@]}"; do
                rem "Copying songs from '$music_dir'"
                find "$music_dir" -iname \*.mp3 | while read song; do
                    song_name="$(basename "$song")"
                    # we tag it based on the parent directory name
                    tag_name="$(basename "$(cd "$(dirname "$song_name")" && pwd)")"
                    [ -f "$SITE_ROOT/music/$song_name" ] || {
                        cmd cp "$song" "$SITE_ROOT/music/" || fail "Failed to copy '$song'"
                    } || rem "'$song' already exists in '$SITE_ROOT/music'"
                    [ $first -eq 0 ] && echo -en ",\n"
                    echo -n "    {\"src\": \"music/$song_name\", \"tags\":[\"$tag_name\"]}"
                    first=0
                done
            done
            echo -e "\n]}"
        } > "$music_file"
    }
}


rem "Generating static assets in $SITE_ROOT"
cd "$BASE_DIR" || fail "failed to cd to $BASE_DIR"
cmd cp -a tpl/{js,css} "$SITE_ROOT/" || fail "Failed to copy static files to site root"
cmd touch "$SITE_ROOT/css/theme.css"
[ $DRYRUN -eq 0 ] && {
    sed "
        s/##TITLE##/$SITE_TITLE/g;
        " < tpl/index.html > "$SITE_ROOT/index.html" \
        || fail "Failed to generate $SITE_ROOT/index.html"
}

rem "Done :) -- edit $SITE_ROOT/css/theme.css for custom styles"

exit 0
