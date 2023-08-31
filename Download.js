export function downloadFile(path, cb, progressCB, notWithPath, opts, basePath_ = "/") {
    const data = toData(path) //check other data types
    if (data) {
        data.then((game) => {
            if (opts.method === "HEAD") {
                cb({ headers: {} })
            } else {
                cb({
                    headers: {},
                    data: game,
                })
            }
        })
    }

    let basePath = basePath_
    if (!basePath.endsWith("/")) basePath += "/"
    basePath = notWithPath ? "" : basePath

    path = basePath + path
    let url
    try {
        url = new URL(path)
    } catch (e) {
    }

    if ((url && ["http:", "https:"].includes(url.protocol)) || !url) {
        const xhr = new XMLHttpRequest()
        if (progressCB instanceof Function) {
            xhr.addEventListener("progress", (e) => {
                const progress = e.total
                    ? " " + Math.floor(e.loaded / e.total * 100).toString() + "%"
                    : " " + (e.loaded / 1048576).toFixed(2) + "MB"
                progressCB(progress)
            })
        }
        xhr.onload = function () {
            if (xhr.readyState === xhr.DONE) {
                let data = xhr.response
                if (xhr.status.toString().startsWith("4") || xhr.status.toString().startsWith("5")) {
                    cb(-1)
                    return
                }
                try {
                    data = JSON.parse(data)
                } catch (e) {
                }
                cb({
                    data: data,
                    headers: {
                        "content-length": xhr.getResponseHeader("content-length"),
                    },
                })
            }
        }
        if (opts.responseType) xhr.responseType = opts.responseType
        xhr.onerror = () => cb(-1)
        xhr.open(opts.method, path, true)
        xhr.send()
    } else {
        (async () => {
            //Most commonly blob: urls. Not sure what else it could be
            if (opts.method === "HEAD") {
                cb({ headers: {} })
                return
            }
            let res
            try {
                res = await fetch(path)
                if ((opts.type && opts.type.toLowerCase() === "arraybuffer") || !opts.type) {
                    res = await res.arrayBuffer()
                } else {
                    res = await res.text()
                    try {
                        res = JSON.parse(res)
                    } catch (e) {
                    }
                }
            } catch (e) {
                cb(-1)
            }
            if (path.startsWith("blob:")) URL.revokeObjectURL(path)
            cb({
                data: res,
                headers: {},
            })
        })()
    }
}

export function toData(data, rv) {
    if (!(data instanceof ArrayBuffer) && !(data instanceof Uint8Array) && !(data instanceof Blob)) return null
    if (rv) return true
    return new Promise(async (resolve) => {
        if (data instanceof ArrayBuffer) {
            resolve(new Uint8Array(data))
        } else if (data instanceof Uint8Array) {
            resolve(data)
        } else if (data instanceof Blob) {
            resolve(new Uint8Array(await data.arrayBuffer()))
        }
        resolve()
    })
}

export function checkCompression(data, log, fileCbFunc) {
    //to be put in another file
    function isCompressed(data) { //https://www.garykessler.net/library/file_sigs.html
        // todo. Use hex instead of numbers
        if ((data[0] === 80 && data[1] === 75) && ((data[2] === 3 && data[3] === 4) || (data[2] === 5 && data[3] === 6) || (data[2] === 7 && data[3] === 8))) {
            return "zip"
        } else if (data[0] === 55 && data[1] === 122 && data[2] === 188 && data[3] === 175 && data[4] === 39 && data[5] === 28) {
            return "7z"
        } else if ((data[0] === 82 && data[1] === 97 && data[2] === 114 && data[3] === 33 && data[4] === 26 && data[5] === 7) && ((data[6] === 0) || (data[6] === 1 && data[7] === 0))) {
            return "rar"
        }
    }

    const createWorker = (path) => {
        return new Promise((resolve, reject) => {
            downloadFile(path, (res) => {
                if (res === -1) {
                    throw Error("Network Error")
                }
                const blob = new Blob([res.data], {
                    "type": "application/javascript",
                })
                const url = window.URL.createObjectURL(blob)
                resolve(new Worker(url))
            }, null, false, {
                responseType: "arraybuffer",
                method: "GET",
            })
        })
    }
    const files = {}
    let res
    const onMessage = (data) => {
        if (!data.data) return
        //data.data.t/ 4=progress, 2 is file, 1 is zip done
        if (data.data.t === 4 && log) {
            const pg = data.data
            const num = Math.floor(pg.current / pg.total * 100)
            if (isNaN(num)) return
            log(num)
        }
        if (data.data.t === 2) {
            if (typeof fileCbFunc === "function") {
                fileCbFunc(data.data.file, data.data.data)
                files[data.data.file] = true
            } else {
                files[data.data.file] = data.data.data
            }
        }
        if (data.data.t === 1) {
            res(files)
        }
    }
    const decompress7z = (file) => {
        return new Promise((resolve, reject) => {
            res = resolve

            createWorker("compression/extract7z.js").then((worker) => {
                worker.onmessage = onMessage
                worker.postMessage(file)
            })
        })
    }
    const decompressRar = (file) => {
        return new Promise((resolve, reject) => {
            res = resolve

            downloadFile("compression/libunrar.js", (res) => {
                downloadFile("compression/libunrar.wasm", (res2) => {
                    if (res === -1 || res2 === -1) {
                        throw Error("Network Error (2)")
                    }
                    const path = URL.createObjectURL(new Blob([res2.data], { type: "application/wasm" }))
                    let data = "\nlet dataToPass = [];\nModule = {\n    monitorRunDependencies: function(left)  {\n        if (left == 0) {\n            setTimeout(function() {\n                unrar(dataToPass, null);\n            }, 100);\n        }\n    },\n    onRuntimeInitialized: function() {\n    },\n    locateFile: function(file) {\n        return '" + path + "';\n    }\n};\n" + res.data + "\nlet unrar = function(data, password) {\n    let cb = function(fileName, fileSize, progress) {\n        postMessage({\"t\":4,\"current\":progress,\"total\":fileSize, \"name\": fileName});\n    };\n\n    let rarContent = readRARContent(data.map(function(d) {\n        return {\n            name: d.name,\n            content: new Uint8Array(d.content)\n        }\n    }), password, cb)\n    let rec = function(entry) {\n        if (!entry) return;\n        if (entry.type === 'file') {\n            postMessage({\"t\":2,\"file\":entry.fullFileName,\"size\":entry.fileSize,\"data\":entry.fileContent});\n        } else if (entry.type === 'dir') {\n            Object.keys(entry.ls).forEach(function(k) {\n                rec(entry.ls[k]);\n            })\n        } else {\n            throw \"Unknown type\";\n        }\n    }\n    rec(rarContent);\n    postMessage({\"t\":1});\n    return rarContent;\n};\nonmessage = function(data) {\n    dataToPass.push({name:  'test.rar', content: data.data});\n};\n                "
                    const blob = new Blob([data], {
                        "type": "application/javascript",
                    })
                    const url = window.URL.createObjectURL(blob)
                    const worker = new Worker(url)
                    worker.onmessage = onMessage
                    worker.postMessage(file)
                }, null, false, {
                    responseType: "arraybuffer",
                    method: "GET",
                })
            }, null, false, {
                responseType: "text",
                method: "GET",
            })

        })
    }
    const decompressZip = (file) => {
        return new Promise((resolve, reject) => {
            res = resolve

            createWorker("compression/extractzip.js").then((worker) => {
                worker.onmessage = onMessage
                worker.postMessage(file)
            })
        })
    }
    const compression = isCompressed(data.slice(0, 10))
    if (compression) {
        //Need to do zip and rar still
        if (compression === "7z") {
            return decompress7z(data)
        } else if (compression === "zip") {
            return decompressZip(data)
        } else if (compression === "rar") {
            return decompressRar(data)
        }
    } else {
        if (typeof fileCbFunc === "function") {
            fileCbFunc("!!notCompressedData", data)
            return new Promise(resolve => resolve({ "!!notCompressedData": true }))
        } else {
            return new Promise(resolve => resolve({ "!!notCompressedData": data }))
        }
    }
}
