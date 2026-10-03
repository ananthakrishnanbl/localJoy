// Everything the lobby and the "select game" page need to know about each game.
// To add a game: append one object to GAMES and drop its images into /assets/games/.
// The game code itself lives in /js/game/<id>/ and is loaded later using `entry`.

export const CONTROLLERS = {
  pad:    "Joystick + buttons",
  dual:   "Twin sticks",
  tilt:   "Tilt your phone",
  choice: "Multiple choice",
  race: "Tilt steering + gas/brake",
  ctf: "Left stick moves · right stick looks · FIRE button above it",
};

export const GAMES = [
    {
        id: "shooter",
        title: "Blast Arena",
        tagline: "Top-down arena shootout",
        description:
            "Left thumb moves, right thumb aims and fires. Dodge around the walls, blast your friends and be the first to ten kills.",
        cover:  "/assets/games/shooter-cover.svg",
        banner: "/assets/games/shooter-banner.svg",
        emoji: "🔫",
        color: "#ff6b57",
        minPlayers: 2,
        maxPlayers: 10,
        rating: 4.5,
        tags: ["Shooter", "Arena"],
        controller: "dual",
        entry: "/js/game/shooter/main.js",
    },
    {
      id: "moto-race",
      title: "Turbo Bikes",
      tagline: "Tilt to steer, race to the line",
      description: "Hold your phone like a steering wheel. Pick a bike, hit the gas, and keep out of the sand and mountains.",
      cover: "/assets/games/moto-race-cover.svg",
      banner: "/assets/games/moto-race-banner.svg",
      emoji: "🏍️",
      color: "#ff8a3d",
      minPlayers: 1,
      maxPlayers: 4,
      rating: 4.5,
      tags: ["Racing", "Motion"],
      controller: "race",
      entry: "/js/game/moto-race/main.js",
    },
    {
      id: "ctf",
      title: "Capture the Flag",
      tagline: "Steal their flag. Guard yours.",
      description: "Two teams, two end rooms, one flag each. Pick RED or BLUE and press A to ready up, then run through the map, grab the enemy flag and bring it back to your own stand. Shoot enemies to slow them down and grab med-kits in the middle room to heal. First team to 3 captures wins. Left stick moves, right stick steers the camera, FIRE sits above it.",
      cover:  "/assets/games/ctf-cover.svg",
      banner: "/assets/games/ctf-banner.svg",
      emoji: "🚩",
      color: "#e5484d",
      minPlayers: 2,
      maxPlayers: 4,
      rating: 4.5,
      tags: ["Shooter", "Team", "3D"],
      controller: "ctf",
      entry: "/js/game/ctf/main.js",
    },
    {
      id: "tdm",
      title: "Team Deathmatch",
      tagline: "Red vs Blue. Or go solo and fight everyone.",
      description: "First-person split-screen shooter. Pick RED, BLUE or SOLO, then eliminate everyone who is not on your side. Most kills in 5 minutes wins. Med-kits wait in the middle of the map and in two random corners. Left stick moves, drag to look, FIRE shoots, plus SWAP / PICK / reload.",
      cover:  "/assets/games/tdm-cover.svg",
      banner: "/assets/games/tdm-banner.svg",
      emoji: "⚔️",
      color: "#e5484d",
      minPlayers: 2,
      maxPlayers: 4,
      rating: 4.5,
      tags: ["Shooter", "Teams", "Split-screen"],
      controller: "ctf",
      entry: "/js/game/tdm/main.js",
    },
];

export const getGame = (id) => GAMES.find((g) => g.id === id);