import { Core } from "./Core.js"

const mapping = [//
    "KeyS", // B
    "KeyA", // A
    "ControlLeft", // Mode
    "Enter", // Start
    "ArrowUp", // UP
    "ArrowDown", // Down
    "ArrowLeft", // Left
    "ArrowRight",// Right
    "KeyD",// C
    "KeyQ",// Y
    "KeyW",// X
    "KeyE",// Z
]

const keyFn = (enu) => (e) => {
    const keyIndex = mapping.indexOf(e.code)
    if (keyIndex >= 0) {
        enu.gameManager.simulateInput(0, keyIndex, +(e.type === "keydown"))
    }
}

export function RunDemo(canvas, popup, rom = "/sonic.bin", config2) {
    const config = {
        gameUrl: rom,
        coreName: "genesis_plus_gx",
    }
    const emu = new Core(canvas, config)
    emu.on("info", popup)
    emu.on("error", popup)

    // Requires user interaction
    emu.downloadCore()
    document.body.addEventListener("keyup", keyFn(emu))
    document.body.addEventListener("keydown", keyFn(emu))

    return emu
}
