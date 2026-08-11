/* eslint-disable no-restricted-globals */
/*  
  Make sure you have installed:
    npm install fast-xml-parser@latest fflate
*/

import { unzipSync } from "fflate"
import sax from "sax" // 'sax' is a commonJS module, so we can import default or as '* as sax'
// Utility to convert binary to Base64
function arrayBufferToBase64(buffer) {
  let binary = ""
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Stream-parse an XML file with the sax library, building a naive AST.
 * @param {Uint8Array} data - raw file data for the .xml file
 * @returns {Object} A root node containing a simplistic AST of the parsed XML.
 */
async function parseLandXMLwithSax(data) {
  const decoder = new TextDecoder("utf-8")
  const parser = sax.parser(true /* strict mode */, { trim: false })

  // We'll store just the key sections your converter expects:
  const landXMLObj = {
    LandXML: {
      Project: {
        // Might contain <Feature> elements
        Feature: {},
      },
      Surfaces: {
        // Surfaces array
        Surface: {},
      },
      Parcels: {
        // Parcels array
        Parcel: [],
      },
      // You could add PlanFeatures if needed, etc.
    },
  }

  // We'll keep track of which node we are in:
  const tagStack = []

  // -- PROJECT / FEATURE / PROPERTY handling --
  const currentProject = landXMLObj.LandXML.Project
  let currentFeature = null
  let currentProperty = null

  // -- SURFACES handling --
  let currentSurface = null
  let currentDefinition = null
  let currentSourceData = null
  let currentP = null // current <P> for points
  let currentFace = null // current <F> for faces text
  let currentBreaklines = null
  let currentBoundaries = null
  let currentBreakline = null
  let currentBoundary = null

  let currentPntList3D = "" // We'll accumulate text from <PntList3D>
  // We store arrays inside the definitions
  // { Pnts: { P: [...] }, Faces: { F: [...] } }

  // -- PARCELS / PARCEL / COORDGEOM / LINE --
  let currentParcel = null
  let currentCoordGeom = null
  let currentLine = null

  // Because <Line> can have sub-tags <Start>, <End>, we store them here
  // We might parse them from text in ontext / onopentag.

  parser.onopentag = (node) => {
    tagStack.push(node.name)
    switch (node.name) {
      // <Project ...>
      case "Project":
        // We have only one <Project> in your sample.
        // If you want multiple, you'd store them in an array.
        currentProject.name = node.attributes.name || ""
        break

      // <Feature ...> inside <Project> or other places
      case "Feature":
        // We'll push a new feature into currentProject.Feature
        currentFeature = {
          "@_name": node.attributes.name || "",
          "@_code": node.attributes.code || "",
          "@_value": node.attributes.value || "",
          // '@_surfType': node.attributes.surfType || '',
          // '@_elevMax': node.attributes.elevMax || '',
          // '@_elevMin': node.attributes.elevMin || '',
          Property: {},
        }
        // If we’re inside <Project>, add it there
        if (tagStack.includes("Project")) {
          currentProject.Feature = currentFeature
        } else if (tagStack.includes("SourceData")) {
          // e.g. in currentSourceData, we might do:
          if (!currentSourceData.Feature) {
            currentSourceData.Feature = {}
          }
          const srcFeature = {
            "@_code": node.attributes.code || "",
            Property: {},
          }
          currentSourceData.Feature = srcFeature
          currentFeature = srcFeature // reuse your currentFeature logic
        }
        // If inside <Definition> (like <Feature code="trimbleCADProperties">),
        // we might attach it to currentDefinition or somewhere else as needed:
        else if (tagStack.includes("Definition") && currentDefinition) {
          currentDefinition.Feature = currentDefinition.Feature || {}
          currentDefinition.Feature = currentFeature
        }
        // else if in other contexts, adapt as needed
        break

      // <Property label="..." value="..." />
      case "Property":
        currentProperty = {
          "@_label": node.attributes.label || "",
          "@_value": node.attributes.value || "",
        }
        // If we have a currentFeature, push it
        if (currentFeature) {
          currentFeature.Property = currentProperty
        }
        break

      // <Surface name="SomeName">
      case "Surface":
        currentSurface = {
          "@_name": node.attributes.name || "",
          Definition: {}, // we fill in later
          SourceData: {}, // We'll store breaklines/boundaries here
        }
        landXMLObj.LandXML.Surfaces.Surface = currentSurface
        break

      // <Definition surfType="TIN" ... >
      case "Definition":
        if (currentSurface) {
          currentDefinition = {
            "@_name": node.attributes.name || "",
            "@_surfType": node.attributes.surfType || "",
            Pnts: { P: [] },
            Faces: { F: [] },
          }
          currentSurface.Definition = currentDefinition
        }
        break

      // <P id="123">some coords</P>
      case "P":
        currentP = {
          "@_id": node.attributes.id || "",
          "#text": "", // will fill in ontext
        }
        if (currentDefinition && currentDefinition.Pnts) {
          currentDefinition.Pnts.P.push(currentP)
        }
        break

      // <F>1 2 3</F>
      case "F":
        currentFace = ""
        // We'll push to currentDefinition.Faces in onclosetag
        break

      // <Parcel name="...">
      case "Parcel":
        currentParcel = {
          "@_name": node.attributes.name || "",
          CoordGeom: {
            Line: [],
          },
        }
        landXMLObj.LandXML.Parcels.Parcel.push(currentParcel)
        break

      // <CoordGeom name="...">
      case "CoordGeom":
        currentCoordGeom = currentParcel?.CoordGeom ?? null
        // If you want multiple <CoordGeom> inside a parcel, you'd adapt here
        if (node.attributes.name) {
          currentCoordGeom["@_name"] = node.attributes.name
        }
        break

      // <Line dir="..." length="..." staStart="...">
      case "Line":
        currentLine = {
          "@_dir": node.attributes.dir || "",
          "@_length": node.attributes.length || "",
          "@_staStart": node.attributes.staStart || "",
          Start: "",
          End: "",
        }
        currentCoordGeom?.Line.push(currentLine)
        break

      case "SourceData":
        if (currentSurface) {
          currentSourceData = {
            Breaklines: { Breakline: [] },
            Boundaries: { Boundary: [] },
          }
          currentSurface.SourceData = currentSourceData
        }
        break

      case "Breaklines":
        if (currentSourceData) {
          currentBreaklines = currentSourceData.Breaklines
          if (!currentBreaklines.Breakline) {
            currentBreaklines.Breakline = []
          }
        }
        break

      case "Breakline":
        // e.g. <Breakline brkType="standard">
        if (currentBreaklines) {
          currentBreakline = {
            "@_brkType": node.attributes.brkType || "",
            PntList3D: "",
          }
          currentBreaklines.Breakline.push(currentBreakline)
        }
        break

      case "Boundaries":
        if (currentSourceData) {
          currentBoundaries = currentSourceData.Boundaries = { Boundary: [] }
        }
        break

      case "Boundary":
        // e.g. <Boundary bndType="island" edgeTrim="true" name="Outer edge">
        if (currentBoundaries) {
          currentBoundary = {
            "@_bndType": node.attributes.bndType || "",
            "@_edgeTrim": node.attributes.edgeTrim || "",
            "@_name": node.attributes.name || "",
            PntList3D: "",
          }
          currentBoundaries.Boundary.push(currentBoundary)
        }
        break

      case "PntList3D":
        // We'll accumulate text in ontext
        currentPntList3D = ""
        break

      // If <Feature code="trimbleCADProperties"> inside <SourceData>
      // or inside <Boundaries>, you can store similarly:
      // <Start>X Y Z</Start>, <End>X Y Z</End> inside a <Line>
      // We'll handle them in ontext based on the top of the stack
      case "Start":
      case "End":
        // we do nothing here except note we are inside Start/End
        break
    }
  }

  parser.ontext = (text) => {
    const currentTag = tagStack[tagStack.length - 1]

    if (currentTag === "PntList3D") {
      // We are inside a <PntList3D> for either a Breakline or a Boundary
      if (currentBreakline && tagStack.includes("Breakline")) {
        currentPntList3D += text // accumulate
      } else if (currentBoundary && tagStack.includes("Boundary")) {
        currentPntList3D += text
      }
    } else if (currentTag === "P" && currentP) {
      // Accumulate coordinate string
      currentP["#text"] += text
    } else if (currentTag === "F") {
      // Accumulate face indices
      currentFace += text
    } else if ((currentTag === "Start" || currentTag === "End") && currentLine) {
      // E.g. <Start>772077.74493 419801.81604 17.00000</Start>
      // Set currentLine.Start or currentLine.End
      if (currentTag === "Start") {
        currentLine.Start += text
      } else {
        currentLine.End += text
      }
    }
  }

  parser.onclosetag = (tagName) => {
    // If we just closed <Property>, reset currentProperty
    if (tagName === "Property") {
      currentProperty = null
    }
    // If we just closed <Feature>, reset currentFeature
    if (tagName === "Feature") {
      currentFeature = null
    }
    // If we just closed <Surface>, reset currentSurface
    if (tagName === "Surface") {
      currentSurface = null
    }
    // If we just closed <Definition>, reset currentDefinition
    if (tagName === "Definition") {
      currentDefinition = null
    }
    // If we just closed <P>, reset currentP
    if (tagName === "P") {
      currentP = null
    }
    // If we just closed <F>, push the text into currentDefinition.Faces
    if (tagName === "F" && currentDefinition?.Faces) {
      currentDefinition.Faces.F.push(currentFace.trim())
      currentFace = null
    }
    // If we just closed <Parcel>, reset
    if (tagName === "Parcel") {
      currentParcel = null
    }
    // If we just closed <CoordGeom>, reset
    if (tagName === "CoordGeom") {
      currentCoordGeom = null
    }
    // If we just closed <Line>, reset currentLine
    if (tagName === "Line") {
      currentLine = null
    }

    if (tagName === "SourceData") {
      currentLine = null
    }
    if (tagName === "Breakline") {
      currentBreakline = null
    }
    if (tagName === "Boundary") {
      currentBoundary = null
    }
    if (tagName === "PntList3D") {
      if (currentBreakline && tagStack.includes("Breakline")) {
        currentBreakline.PntList3D = currentPntList3D.trim()
      } else if (currentBoundary && tagStack.includes("Boundary")) {
        currentBoundary.PntList3D = currentPntList3D.trim()
      }
      currentPntList3D = ""
    }
    if (tagName === "Boundaries") {
      currentBoundaries = null
    }
    if (tagName === "Breaklines") {
      currentBreaklines = null
    }
    if (tagName === "SourceData") {
      currentSourceData = null
    }
    // pop the stack
    tagStack.pop()
  }

  parser.onerror = (err) => {
    console.error("SAX parse error:", err)
    parser.error = null
    throw err
  }

  // Stream the data in chunks to avoid one massive string
  const chunkSize = 256 * 1024
  let offset = 0
  while (offset < data.length) {
    const slice = data.subarray(offset, offset + chunkSize)
    parser.write(decoder.decode(slice, { stream: true }))
    offset += chunkSize
  }
  parser.close()

  return landXMLObj
}
// The Web Worker 'message' event handler
self.onmessage = async (event) => {
  const { fileData, zipfileName, unzipContent, isPsli } = event.data
  try {
    const uint8Array = new Uint8Array(fileData)
    const unzipped = unzipSync(uint8Array)
    const fileNames = Object.keys(unzipped)
    // Instead of a 'batch' array, we have a map for grouping
    const groupMap = new Map()
    self.postMessage({ type: "progress", progress: 20 })

    // We'll process all files at once (no partial chunking here)

    // Add special handling for .psli files
    if (isPsli) {
      // Look for .jpg, .jgw, and .txt files
      let jpgFile = null
      let jgwFile = null
      let txtFile = null

      const files = []
      for (const fileName of fileNames) {
        files.push({ name: fileName, async: async () => unzipped[fileName] })
      }

      for (const file of files) {
        const fileName = file.name.toLowerCase()
        if (fileName.endsWith(".jpg") || fileName.endsWith(".jpeg")) {
          jpgFile = file
        } else if (fileName.endsWith(".jgw")) {
          jgwFile = file
        } else if (fileName.endsWith(".txt")) {
          txtFile = file
        }
      }

      // Process the files
      if (jpgFile && jgwFile) {
        let elevation = 0
        let rawFile = null

        // If txt file exists, extract elevation
        if (txtFile && unzipContent) {
          const txtContent = new TextDecoder().decode(unzipped[txtFile.name])
          // Try to parse the last line as elevation
          const lines = txtContent.trim().split("\n")
          const lastLine = lines[lines.length - 1]
          if (!isNaN(Number.parseFloat(lastLine))) {
            elevation = Number.parseFloat(lastLine)
          }
        }

        // Process JGW file
        const jgwContent = new TextDecoder().decode(unzipped[jgwFile.name])
        const jgwValues = {
          data: jgwContent,
          parsed: parseJgwFile(jgwContent),
        }

        // Process JPG file
        rawFile = unzipped[jpgFile.name]
        const jpgData = arrayBufferToBase64(rawFile)

        self.postMessage({
          type: "success",
          result: [
            {
              fileName: zipfileName,
              jpgFile: {
                data: `data:image/jpeg;base64,${jpgData}`,
                fileName: jpgFile.name,
              },
              jgwValues: {
                data: jgwContent,
                parsed: jgwValues.parsed,
              },
              elevation: elevation,
            },
          ],
        })
        return
      }
    }

    // Continue with existing code for other file types...
    for (const fileName of fileNames) {
      const rawFile = unzipped[fileName]
      // e.g. "250131 Drury Sth All GSD200"
      const baseName = zipfileName

      if (!groupMap.has(baseName)) {
        groupMap.set(baseName, {
          fileName: baseName,
          xmlContent: null,
          jgwValues: null,
          dxfContent: null,
          jpgFile: null,
        })
      }
      const fileObj = groupMap.get(baseName)

      if (fileName.endsWith(".xml")) {
        if (unzipContent) {
          const parsedData = await parseLandXMLwithSax(rawFile)
          fileObj.xmlContent = {
            data: parsedData,
            fileName: fileName,
          }
        } else {
          fileObj.xmlContent = {
            fileName: fileName,
          }
        }
        self.postMessage({ type: "progress", progress: 50 })
      } else if (fileName.endsWith(".jgw")) {
        const decoder = new TextDecoder()
        fileObj.jgwValues = {
          data: decoder.decode(rawFile),
          fileName: fileName,
        }
        self.postMessage({ type: "progress", progress: 50 })
      } else if (fileName.endsWith(".dxf")) {
        if (unzipContent) {
          fileObj.dxfContent = {
            data: arrayBufferToBase64(rawFile),
            fileName: fileName,
          }
        } else {
          fileObj.dxfContent = {
            fileName: fileName,
          }
        }
        self.postMessage({ type: "progress", progress: 70 })
      } else if (/\.(jpg|jpeg)$/i.test(fileName)) {
        const base64 = arrayBufferToBase64(rawFile)
        fileObj.jpgFile = {
          data: `data:image/jpeg;base64,${base64}`,
          fileName: fileName,
        }
        self.postMessage({ type: "progress", progress: 90 })
      }
    }

    // Convert groupMap to an array
    const groupedFiles = Array.from(groupMap.values())
    self.postMessage({ type: "progress", progress: 100 })

    // Send everything as a single message
    self.postMessage({ success: true, data: groupedFiles, result: groupedFiles })
  } catch (error) {
    console.error("Error in worker:", error)
    self.postMessage({ success: false, error: error.message })
  }
}

// Helper function to parse JGW file
function parseJgwFile(jgwContent) {
  const lines = jgwContent.trim().split("\n")
  if (lines.length >= 6) {
    return {
      pixelWidth: Number.parseFloat(lines[0]),
      rotationX: Number.parseFloat(lines[1]),
      rotationY: Number.parseFloat(lines[2]),
      pixelHeight: Number.parseFloat(lines[3]),
      topLeftX: Number.parseFloat(lines[4]),
      topLeftY: Number.parseFloat(lines[5]),
    }
  }
  return null
}
