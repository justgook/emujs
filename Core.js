import { EJsStorage } from "./EJsStorage.js"
import { CoreManager } from "./CoreManager.js"
import { checkCompression, downloadFile, toData } from "./Download.js"

export class Core {
    extensions = {
        "genesis_plus_gx": ["m3u",
            "mdx",
            "md",
            "smd",
            "gen",
            "bin",
            "cue",
            "iso",
            "chd",
            "bms",
            "sms",
            "gg",
            "sg",
            "68k",
            "sgd"],
    }
    functions = {}

    constructor(canvas, config) {
        this.config = config
        this.coreName = config.coreName || "genesis_plus_gx"

        this.canvas = canvas
        window.addEventListener("resize", this.handleResize.bind(this))

        this.storage = {
            rom: new EJsStorage("EmulatorJS-roms", "rom"),
            bios: new EJsStorage("EmulatorJS-bios", "bios"),
            core: new EJsStorage("EmulatorJS-core", "core"),
            states: new EJsStorage("EmulatorJS-states", "states"),
        }

    }

    createElement(type) {
        return document.createElement(type)
    }

    on(event, func) {
        if (!Array.isArray(this.functions[event])) this.functions[event] = []
        this.functions[event].push(func)
    }

    callEvent(event, data) {
        if (!Array.isArray(this.functions[event])) return 0
        this.functions[event].forEach(e => e(data))
        return this.functions[event].length
    }

    downloadCore() {
        this.callEvent("info", "Download Game Core")

        const gotCore = (data) => {
            this.callEvent("info", `Decompress Game Core`)
            checkCompression(new Uint8Array(data), (p) => this.callEvent("info", `Decompress Game Core ${p}%`))
                .then((data) => {
                    let js, thread, wasm
                    for (let k in data) {
                        if (k.endsWith(".wasm")) {
                            wasm = data[k]
                        } else if (k.endsWith(".worker.js")) {
                            thread = data[k]
                        } else if (k.endsWith(".js")) {
                            js = data[k]
                        }
                    }
                    this.initCore(js, wasm, thread)
                })
        }
        this.storage.core.get(`${this.coreName}-wasm.data`).then((result) => {
            gotCore(result.data)
        })
    }

    initCore(js, wasm, thread) {
        this.Module = getModuleConfig(wasm, thread, this.canvas)
        this.Module["onRuntimeInitialized"] = async () => {
            this.callEvent("info", "moduleReady")
            this.gameManager = new CoreManager(this.Module)
            await this.downloadRom(this.gameManager.FS)
            this.startGame()
        }

        let script = this.createElement("script")
        script.src = URL.createObjectURL(new Blob([js], { type: "application/javascript" }))
        document.body.appendChild(script)
    }

    displayMessage(message) {
        this.callEvent("info", message)
    }

    downloadRom(FS) {
        return new Promise((resolve, reject) => {
            this.callEvent("info", "Download Game Data")
            const gotGameData = (data) => {
                let resData = {}
                const altName = this.config.gameUrl.startsWith("blob:")
                    ? (this.config.gameName || "game")
                    : this.config.gameUrl.split("/").pop().split("#")[0].split("?")[0]
                this.callEvent("info", "Decompress Game Data")
                checkCompression(new Uint8Array(data),
                    (p) => console.log(`Decompress Game Data ${p}%}`),
                    (fileName, fileData) => {
                        if (fileName.includes("/")) {
                            const paths = fileName.split("/")
                            let cp = ""
                            for (let i = 0; i < paths.length - 1; i++) {
                                if (paths[i] === "") continue
                                cp += "/" + paths[i]
                                if (!FS.analyzePath(cp).exists) {
                                    FS.mkdir(cp)
                                }
                            }
                        }
                        if (fileName.endsWith("/")) {
                            FS.mkdir(fileName)
                            return
                        }
                        if (fileName !== "!!notCompressedData") {
                            resData[fileName] = true
                        }
                        if (fileName === "!!notCompressedData") {
                            FS.writeFile(altName, fileData)
                            resData[altName] = true
                        } else {
                            FS.writeFile("/" + fileName, fileData)
                        }
                    }).then(() => {
                    const fileNames = (() => {
                        let rv = []
                        for (const k in resData) {
                            rv.push(k)
                        }
                        return rv
                    })()
                    if (fileNames.length === 1) fileNames[0] = altName

                    for (const k in resData) {
                        if (k === "!!notCompressedData") {
                            this.fileName = altName
                            break
                        }
                        if (!this.fileName || ((this.extensions[this.coreName] || []).includes(k.split(".")
                            .pop()))) {
                            this.fileName = k
                        }

                    }

                    resolve()
                })
            }

            downloadFile(this.config.gameUrl, (res) => {
                if (res === -1) {
                    this.callEvent("error", "Network Error")
                    return
                }
                const name = (typeof this.config.gameUrl === "string") ? this.config.gameUrl.split("/").pop() : "game"
                this.storage.rom.get(name).then((result) => {
                    if (result && result["content-length"] === res.headers["content-length"] && !this.debug && name !== "game") {
                        gotGameData(result.data)
                        return
                    }
                    downloadFile(this.config.gameUrl, (res) => {
                        if (res === -1) {
                            this.callEvent("error", "Network Error")
                            return
                        }
                        if (toData(this.config.gameUrl, true)) {
                            this.config.gameUrl = "game"
                        }
                        gotGameData(res.data)

                    }, (progress) => {
                        this.callEvent("info", "Download Game Data" + progress)
                    }, true, {
                        responseType: "arraybuffer",
                        method: "GET",
                    })
                })
            }, null, true, { method: "HEAD" })
        })
    }

    startGame() {
        try {
            const args = []
            args.push("/" + this.fileName)
            this.Module.callMain(args)
            this.Module.resumeMainLoop()

            this.callEvent("ready")

            this.handleResize()
        } catch (e) {
            console.warn("failed to start game", e)
            this.callEvent("error", "Failed to start game")
            return
        }
        this.callEvent("start")
    }

    handleResize() {
        if (!this.Module) return
        const dpr = window.devicePixelRatio || 1
        const positionInfo = this.canvas.getBoundingClientRect()
        const width = positionInfo.width * dpr
        const height = (positionInfo.height * dpr)
        this.Module.setCanvasSize(width, height)
    }

}

function getModuleConfig(wasmData, threadData, canvas) {
    window.Module = {
        "noInitialRun": true, // "onRuntimeInitialized": this.downloadFiles.bind(this),
        "canvas": canvas,
        "arguments": [],
        "preRun": [],
        "postRun": [],
        "print": console.log,
        "printErr": console.error,
        "totalDependencies": 0,
        "monitorRunDependencies": () => {
        },
        "locateFile": function (fileName) {
            if (fileName.endsWith(".wasm")) {
                return URL.createObjectURL(new Blob([wasmData], { type: "application/wasm" }))
            } else if (fileName.endsWith(".worker.js")) {
                return URL.createObjectURL(new Blob([threadData], { type: "application/javascript" }))
            }
        },
    }
    return window.Module
}
