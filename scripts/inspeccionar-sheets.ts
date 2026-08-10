import { google } from "googleapis";

const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n");

const IDS = [
  "1lDe_66VPnJMPhCaBPuZyRwt9FEhhwHE0iWRvWYupgK0",
  "1vF7wnXUmlDB_0D5q1D6FDjyRLs4aiEx_",
  "1Ek687rzxylX_TZtikcG4pyzNLOgsg1huLe4uczFASPE",
  "1YXCtIqc-D4zC3JiUra-8PmgKOsclQV5zNZuPs6rEjaA",
  "1ip830ar-7heBkAn6L3R1LBmmsb9f3xxl0ipBpH5qsL4",
  "1m8vJmgp83masfZMfKtEAE3BTZUydAfLTykQMjs1OI2k",
];

async function main() {
  const auth = new google.auth.JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
  const sheets = google.sheets({ version: "v4", auth });

  for (const id of IDS) {
    console.log("\n=== " + id + " ===");
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
      console.log("Título:", meta.data.properties?.title);
      for (const hoja of meta.data.sheets || []) {
        const props = hoja.properties;
        console.log(`  Pestaña: "${props?.title}" (${props?.gridProperties?.rowCount}x${props?.gridProperties?.columnCount})`);
      }
      // Primeras filas de la primera pestaña, para ver las cabeceras.
      const primeraHoja = meta.data.sheets?.[0]?.properties?.title;
      if (primeraHoja) {
        const valores = await sheets.spreadsheets.values.get({
          spreadsheetId: id,
          range: `'${primeraHoja}'!A1:J5`,
        });
        console.log("  Primeras filas:", JSON.stringify(valores.data.values));
      }
    } catch (err: any) {
      console.log("  ERROR:", err.message);
    }
  }
}

main();
