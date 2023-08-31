export class CoreManager {
    constructor(Module) {
        this.Module = Module
        this.FS = this.Module.FS
        this.functions = {
            restart: this.Module.cwrap("system_restart", "", []),
            getStateInfo: this.Module.cwrap("get_state_info", "string", []), //these names are dumb
            saveStateInfo: this.Module.cwrap("save_state_info", "null", []),
            loadState: this.Module.cwrap("load_state", "number", ["string", "number"]),
            screenshot: this.Module.cwrap("cmd_take_screenshot", "", []),
            simulateInput: this.Module.cwrap("simulate_input", "null", ["number", "number", "number"]),
            toggleMainLoop: this.Module.cwrap("toggleMainLoop", "null", ["number"]),
            getCoreOptions: this.Module.cwrap("get_core_options", "string", []),
            setVariable: this.Module.cwrap("set_variable", "null", ["string", "string"]),
            setCheat: this.Module.cwrap("set_cheat", "null", ["number", "number", "string"]),
            resetCheat: this.Module.cwrap("reset_cheat", "null", []),
            toggleShader: this.Module.cwrap("shader_enable", "null", ["number"]),
            getDiskCount: this.Module.cwrap("get_disk_count", "number", []),
            getCurrentDisk: this.Module.cwrap("get_current_disk", "number", []),
            setCurrentDisk: this.Module.cwrap("set_current_disk", "null", ["number"]),
            getSaveFilePath: this.Module.cwrap("save_file_path", "string", []),
            saveSaveFiles: this.Module.cwrap("cmd_savefiles", "", []),
            supportsStates: this.Module.cwrap("supports_states", "number", []),
            loadSaveFiles: this.Module.cwrap("refresh_save_files", "null", []),
            setVolume: this.Module.cwrap("set_volume", "null", ["number"]),
            toggleFastForward: this.Module.cwrap("toggle_fastforward", "null", ["number"]),
            setFastForwardRatio: this.Module.cwrap("set_ff_ratio", "null", ["number"]),
            toggleRewind: this.Module.cwrap("toggle_rewind", "null", ["number"]),
            setRewindGranularity: this.Module.cwrap("set_rewind_granularity", "null", ["number"]),
            toggleSlowMotion: this.Module.cwrap("toggle_slow_motion", "null", ["number"]),
            setSlowMotionRatio: this.Module.cwrap("set_sm_ratio", "null", ["number"]),
        }
        this.mkdir("/home")
        this.mkdir("/home/web_user")
        this.mkdir("/home/web_user/retroarch")
        this.mkdir("/home/web_user/retroarch/userdata")
        this.mkdir("/home/web_user/retroarch/userdata/config")
        this.mkdir("/home/web_user/retroarch/userdata/config/Beetle PSX HW")
        this.FS.writeFile("/home/web_user/retroarch/userdata/config/Beetle PSX HW/Beetle PSX HW.opt",
            "beetle_psx_hw_renderer = \"software\"\n")

        this.mkdir("/data")
        this.mkdir("/data/saves")
        this.FS.writeFile("/home/web_user/retroarch/userdata/retroarch.cfg", this.getRetroArchCfg())

        this.FS.mount(IDBFS, {}, "/data/saves")
        this.FS.syncfs(true, () => {
        })
    }

    mkdir(path) {
        try {
            this.FS.mkdir(path)
        } catch (e) {
        }
    }

    getRetroArchCfg() {
        return (`autosave_interval = 60
screenshot_directory = "/"
block_sram_overwrite = false
video_gpu_screenshot = false
audio_latency = 64
video_top_portrait_viewport = true
video_vsync = true
video_smooth = false
fastforward_ratio = 3.0
slowmotion_ratio = 3.0
savefile_directory = "/data/saves"
`)
    }

    restart() {
        this.functions.restart()
    }

    getState() {
        return new Promise(async (resolve, reject) => {
            const stateInfo = (await this.getStateInfo()).split("|")
            let state
            let size = stateInfo[0] >> 0
            if (size > 0) {
                state = new Uint8Array(size)
                let start = stateInfo[1] >> 0
                for (let i = 0; i < size; i++) {
                    state[i] = this.Module.getValue(start + i)
                }
            }
            resolve(state)
        })
    }

    getStateInfo() {
        this.functions.saveStateInfo()
        return new Promise((resolve) => {
            let a
            let b = setInterval(() => {
                a = this.functions.getStateInfo()
                if (a) {
                    clearInterval(b)
                    resolve(a)
                }
            }, 50)
        })
    }

    loadState(state) {
        try {
            this.FS.unlink("game.state")
        } catch (e) {
        }
        this.FS.writeFile("/game.state", state)
        this.functions.loadState("game.state", 0)
        setTimeout(() => {
            try {
                this.FS.unlink("game.state")
            } catch (e) {
            }
        }, 5000)
    }

    screenshot() {
        this.functions.screenshot()
        return this.FS.readFile("screenshot.png")
    }

    quickSave(slot) {
        if (!slot) slot = 1;
        (async () => {
            let name = slot + "-quick.state"
            try {
                this.FS.unlink(name)
            } catch (e) {
            }
            let data = await this.getState()
            this.FS.writeFile("/" + name, data)
        })()
    }

    quickLoad(slot) {
        if (!slot) slot = 1;
        (async () => {
            let name = slot + "-quick.state"
            this.functions.loadState(name, 0)
        })()
    }

    /**
     * @param {0|1|2|3} player           Player number from 0 to 3.
     * @param {number} index            Button index.
     * @param {0|1} value            Key pressed.
     */
    simulateInput(player, index, value) {
        this.functions.simulateInput(player, index, value)
    }

    getFileNames() {
        return ["toc", "ccd", "exe", "pbp", "chd", "img", "bin", "iso"]
    }

    toggleMainLoop(playing) {
        this.functions.toggleMainLoop(playing)
    }

    getCoreOptions() {
        return this.functions.getCoreOptions()
    }

    setVariable(option, value) {
        this.functions.setVariable(option, value)
    }

    setCheat(index, enabled, code) {
        this.functions.setCheat(index, enabled, code)
    }

    resetCheat() {
        this.functions.resetCheat()
    }

    toggleShader(active) {
        this.functions.toggleShader(active)
    }

    getDiskCount() {
        return this.functions.getDiskCount()
    }

    getCurrentDisk() {
        return this.functions.getCurrentDisk()
    }

    setCurrentDisk(disk) {
        this.functions.setCurrentDisk(disk)
    }

    getSaveFilePath() {
        return this.functions.getSaveFilePath()
    }

    saveSaveFiles() {
        this.functions.saveSaveFiles()
        this.FS.syncfs(false, () => {
        })
    }

    supportsStates() {
        return !!this.functions.supportsStates()
    }

    getSaveFile() {
        this.saveSaveFiles()
        const exists = this.FS.analyzePath(this.getSaveFilePath()).exists
        return (exists ? this.FS.readFile(this.getSaveFilePath()) : null)
    }

    loadSaveFiles() {
        this.functions.loadSaveFiles()
    }

    setFastForwardRatio(ratio) {
        this.functions.setFastForwardRatio(ratio)
    }

    toggleFastForward(active) {
        this.functions.toggleFastForward(active)
    }

    setSlowMotionRatio(ratio) {
        this.functions.setSlowMotionRatio(ratio)
    }

    toggleSlowMotion(active) {
        this.functions.toggleSlowMotion(active)
    }

    setRewindGranularity(value) {
        this.functions.setRewindGranularity(value)
    }
}
