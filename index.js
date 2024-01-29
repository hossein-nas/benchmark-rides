import inquirer from "inquirer";
import Excel from "exceljs";
import fs from "fs";
import path from "path";

const HITRO_REQUEST_URL = "https://api2.hitro.mobi/api/1/web/estimates/request";
const TAPSI_REQUEST_URL = "https://api.tapsi.cab/api/v3/ride/preview";

const workbook = new Excel.Workbook();

function getHitroPricesText(carTypePrices) {
    return carTypePrices.map((item, index) => item.TotalPrice)
}

inquirer
    .prompt([{
        name: "hitroToken", message: "Please paste token of hitro app", type: "input",
    }, {
        name: "tapsiToken", message: "Please paste token of tapsi app", type: "input",
    }, {
        name: "filePath", message: "Please enter relative/absolute path of CSV file?", type: "input",
        default: '~/Downloads/input.xlsx'
    },
        {
            name: "outputPath",
            message: "Please enter relative/absolute output path of CSV file?",
            type: "input",
            default: '~/Desktop/output.xlsx'
        },
        {
            name: "start?", message: "Do wanna start now?", type: "confirm",
        },])
    .then(async (answers) => {
        console.table(answers);

        const {filePath, outputPath} = answers;

        const resolovedFilePath = hasHomeAlias(filePath) ? resolveHome(filePath) : path.resolve(filePath);
        const resolvedOutputPath = hasHomeAlias(outputPath) ? resolveHome(outputPath) : path.resolve(outputPath);

        const wait = sleep(3000)


        if (resolovedFilePath) {
            const coordinates = await readCoordinates(resolovedFilePath);
            if (coordinates && coordinates.length) {

                // Object.values(coordinates).forEach((coord) => {
                for (let coord of coordinates) {

                    await requestHitro({...coord.value, token: answers.hitroToken}).then((resp) => {
                        const {row} = coord
                        const col5 = row.getCell(5);
                        const col6 = row.getCell(6);
                        const col7 = row.getCell(7);

                        const [vipPrice = -1, premiumPrice = -1] = getHitroPricesText(resp.carTypePrices)
                        col5.value = vipPrice;
                        col6.value = premiumPrice;
                        col7.value = resp

                        row.commit()

                        row.worksheet.workbook.xlsx.writeFile(resolvedOutputPath)
                    });

                    await requestTapsi({...coord.value, token: answers.tapsiToken}).then(async (resp) => {
                        const [VIPPrice, ECOPrice] = await extractPakroPrice(resp)
                        const {row} = coord
                        const tapsiVIPPriceCell = row.getCell(8);
                        const tapsiECOPriceCell = row.getCell(9);
                        const payloadCell= row.getCell(10);

                        tapsiVIPPriceCell.value = VIPPrice;
                        tapsiECOPriceCell.value = ECOPrice;
                        payloadCell.value = resp

                        row.commit()

                        row.worksheet.workbook.xlsx.writeFile(resolvedOutputPath)
                    });

                    await wait();
                }


            }
        }
    });


const sleep = (timeMs = 10_000) => async () => {
    console.log('waiting... for 10 sec ...')
    return new Promise((resolve) => {
        setTimeout(() => resolve(), timeMs)
    })
}

async function readCoordinates(filePath) {
    return workbook.xlsx
        .readFile(filePath)
        .then(() => {
            const worksheet = workbook.getWorksheet(1);
            const rowsCount = worksheet.rowCount;
            const rows = [];
            for (let i = 2; i <= rowsCount; i++) {
                rows.push({
                    value: convertRowToCoordinates(worksheet.getRow(i)),
                    worksheet,
                    workbook,
                    row: worksheet.getRow(i)
                });
            }
            return rows;
        })
        .catch((err) => {
            console.error({err});
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

async function requestTapsi({originLat, originLng, destLat, destLng, token}) {

    const headers = {
        "Content-Type": "application/json",
        Accept: "*/*",
        Cookie: `accessToken=${token}`,
        'X-Agent': 'v2.2|passenger|WEBAPP|6.18.4||5.0'
    };

    const options = {
        mode: 'cors',
        credentials: 'include',
        headers, method: "POST", body: JSON.stringify({
            "origin": {"latitude": originLat, "longitude": originLng},
            "destinations": [{"latitude": destLat, "longitude": destLng}],
            "hasReturn": false,
            "waitingTime": 0,
            "gateway": "PAKRO",
            "initiatedVia": "WEB"
        }),
    };
    try {
        const req = await fetch(TAPSI_REQUEST_URL, options);
        debugger;

        if (req.ok) {
            const response = await req.json();
            return response;
        }
    } catch (e) {
        console.log({e});
    }
}

async function requestHitro({originLat, originLng, destLat, destLng, token}) {

    const headers = {
        authorization: `Bearer ${token}`,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
    };

    const options = {
        headers, method: "POST", body: new URLSearchParams({
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

        if (req.ok) {
            const response = await req.json();
            return response;
        }
    } catch (e) {
        console.log({e});
    }
}


async function extractPakroPrice(response) {
    try {
        if (response.result === 'OK') {
            const {categories} = response.data;
            const [, cat] = categories
            const [VIP, ECO] = cat.items

            return [VIP, ECO].map(item => itemToPrice(item))

        }
    } catch (e) {
        console.log({e})
        return [0, 0]
    }
}

function itemToPrice(item) {
    const response = item?.service.prices?.[0]?.['passengerShare'] ?? 0
    debugger;
    return response;
}
