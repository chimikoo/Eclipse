import fetch from "node-fetch";
import { writeFile, mkdir } from "fs/promises";

const { CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !ACCESS_TOKEN) {
  console.error("❌ Missing environment variables! Check your .env file.");
  process.exit(1);
}

const REPORT_ID = "vkpJ2qRdrGAWFQaV"; // Just the report code, not full URL

const query = `
  query {
    reportData {
      report(code: "${REPORT_ID}") {
        title
        fights {
          id
          name
          kill
          fightPercentage
          encounterID
        }
      }
    }
  }
`;

async function fetchFightData() {
  try {
    const response = await fetch("https://www.warcraftlogs.com/api/v2/client", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);

    const result = await response.json();
    console.log("🔎 Raw API Response:", JSON.stringify(result, null, 2));

    const report = result.data?.reportData?.report;

    if (!report) {
      throw new Error("❌ No report data found. Check if the REPORT_ID is correct.");
    }

    console.log(`✅ Fetched report: ${report.title}`);

    const bossFights = report.fights
      .filter(fight => fight.encounterID && fight.encounterID > 0)
      .map(({ id, name, kill, fightPercentage }) => ({
        summary_url: `https://www.warcraftlogs.com/reports/${REPORT_ID}#fight=${id}`,
        boss_name: name,
        wipe_percentage: kill === true ? "Kill" : fightPercentage ?? "N/A"
      }));

    if (bossFights.length === 0) {
      console.log("⚠️ No valid boss fights found in this report.");
      return;
    }

    const dir = "logs";
    await mkdir(dir, { recursive: true });
    const fileName = `${dir}/${report.title.replace(/\s/g, "_")}_Fights.json`;

    await saveToJson(fileName, bossFights);
  } catch (error) {
    console.error("❌ Error fetching fight data:", error);
  }
}

async function saveToJson(fileName, data) {
  try {
    await writeFile(fileName, JSON.stringify(data, null, 2));
    console.log(`✅ JSON saved as ${fileName}`);
  } catch (error) {
    console.error("❌ Error saving JSON:", error);
  }
}

fetchFightData();
