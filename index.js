import inquirer from "inquirer";
import Excel from "exceljs";
import fs from "fs";
import path from "path";

const HITRO_REQUEST_URL = "https://api2.hitro.mobi/api/1/web/estimates/request";

const workbook = new Excel.Workbook();

inquirer
  .prompt([
    {
      name: "hitroToken",
      message: "Please paste token of hitro app",
      type: "input",
    },
    {
      name: "tapsiToken",
      message: "Please paste token of tapsi app",
      type: "input",
    },
    {
      name: "filePath",
      message: "Please enter relative/absolute path of CSV file?",
      type: "input",
    },
    {
      name: "start?",
      message: "Do wanna start now?",
      type: "confirm",
    },
  ])
  .then(async (answers) => {
    console.table(answers);

    const { filePath } = answers;

    const resolovedFilePath = hasHomeAlias(filePath)
      ? resolveHome(filePath)
      : path.resolve(filePath);

    console.log({ resolovedFilePath });

    if (resolovedFilePath) {
      const coordinates = await readCoordinates(resolovedFilePath);
      console.log({ coordinates });
      if (coordinates && coordinates.length) {
        const coord = coordinates[0];
        requestHitro({ ...coord, token: answers.hitroToken }).then((resp) => {
          console.log({ resp });
        });
      }
    }
  });

async function readCoordinates(filePath) {
  return workbook.xlsx
    .readFile(filePath)
    .then(() => {
      const worksheet = workbook.getWorksheet(1);
      const rowsCount = worksheet.rowCount;
      const rows = [];
      for (let i = 2; i <= rowsCount; i++) {
        rows.push(convertRowToCoordinates(worksheet.getRow(i)));
      }
      console.log({ rows });
      return rows;
    })
    .catch((err) => {
      console.error({ err });
    });
}

function convertRowToCoordinates(row) {
  return {
    originLat: Number(row.getCell(1).value),
    originLng: Number(row.getCell(2).value),
    destLat: Number(row.getCell(3).value),
    destLng: Number(row.getCell(4).value),
  };
}

function hasHomeAlias(filePath) {
  return filePath.startsWith("~");
}

function resolveHome(filepath) {
  if (filepath[0] === "~") {
    return path.join(process.env.HOME, filepath.slice(1));
  }
  return filepath;
}

async function requestHitro({ originLat, originLng, destLat, destLng, token }) {
  const headers = {
    authorization: `Bearer ${token}`,
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };

  const options = {
    headers,
    method: "POST",
    body: new URLSearchParams({
      SourceLatitude: originLat,
      SourceLongitude: originLng,
      "Dest[0][Lat]": destLat,
      "Dest[0][Lon]": destLng,
      "Dest[0][dest]": "",
      WaitingMinutes: 0,
      RoundTrip: 0,
    }),
  };
  try {
    const req = await fetch(HITRO_REQUEST_URL, options);
    debugger;

    if (req.ok) {
      const response = await req.json();
      return response;
    }
  } catch (e) {
    console.log({ e });
  }
}
