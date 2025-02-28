import fetch from "node-fetch";
import { writeFile, mkdir } from "fs/promises";

const { CLIENT_ID, CLIENT_SECRET, ACCESS_TOKEN } = process.env;

if (!CLIENT_ID || !CLIENT_SECRET || !ACCESS_TOKEN) {
  console.error("❌ Missing environment variables! Check your .env file.");
  process.exit(1);
}

const REPORT_ID = "vkpJ2qRdrGAWFQaV"; // Replace with your actual report ID

const germanDate = new Date().toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })
  .split(".")
  .reverse()
  .map(num => num.padStart(2, "0"))
  .join("-");

function formatTime(timestamp, fightStart) {
  if (!fightStart) {
    console.warn("⚠️ Missing startTime for fight.");
    return "Unknown";
  }
  const totalSeconds = Math.floor((timestamp - fightStart) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function fetchFightData() {
  try {
    const fightsQuery = `
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
              startTime
            }
            masterData {
              actors {
                id
                name
                type
              }
            }
          }
        }
      }
    `;

    const fightsResponse = await fetch("https://www.warcraftlogs.com/api/v2/client", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: fightsQuery })
    });

    if (!fightsResponse.ok) throw new Error(`API request failed: ${fightsResponse.statusText}`);

    const fightsResult = await fightsResponse.json();
    const report = fightsResult.data?.reportData?.report;

    if (!report) {
      throw new Error("❌ No report data found. Check if the REPORT_ID is correct.");
    }

    console.log(`✅ Fetched report: ${report.title}`);

    const playerMap = {};
    report.masterData.actors.forEach(player => {
      if (player.type === "Player") {
        playerMap[player.id] = player.name;
      }
    });

    const bossFights = report.fights.filter(fight => fight.encounterID > 0);
    console.log(`🗡️ Found ${bossFights.length} boss fights.`);

    let finalFightData = [];

    for (const fight of bossFights) {
      console.log(`🔎 Fetching deaths for fight: ${fight.name} (ID: ${fight.id})`);

      const deathsQuery = `
        query {
          reportData {
            report(code: "${REPORT_ID}") {
              events(startTime: 0, endTime: 99999999, dataType: Deaths, fightIDs: [${fight.id}], limit: 500) {
                data
                nextPageTimestamp
              }
            }
          }
        }
      `;

      const deathsResponse = await fetch("https://www.warcraftlogs.com/api/v2/client", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: deathsQuery })
      });

      if (!deathsResponse.ok) {
        console.warn(`⚠️ Failed to fetch deaths for fight ${fight.id}`);
        continue;
      }

      const deathsResult = await deathsResponse.json();
      const deathsData = deathsResult.data?.reportData?.report?.events?.data;

      let deathsByFight = [];

      if (deathsData && deathsData.length > 0) {
        console.log(`✅ Retrieved ${deathsData.length} death events for fight: ${fight.name}`);

        deathsData.slice(0, 3).forEach(({ timestamp, fight: fightID, targetID }, index) => {  
          const playerName = playerMap[targetID] || "Unknown Player";
          const deathTimeFormatted = formatTime(timestamp, fight.startTime);

          const deathUrl = `https://www.warcraftlogs.com/reports/${REPORT_ID}?fight=${fightID}&type=deaths&start=${timestamp - 5000}&end=${timestamp + 5000}&death=${index + 1}`;

          deathsByFight.push({
            player: playerName,
            death_time: deathTimeFormatted,
            death_url: deathUrl
          });
        });
      } else {
        console.warn(`⚠️ No deaths recorded for fight ${fight.name}`);
      }

      finalFightData.push({
        summary_url: `https://www.warcraftlogs.com/reports/${REPORT_ID}?fight=${fight.id}`,
        boss_name: fight.name,
        wipe_percentage: fight.kill === true ? "Kill" : fight.fightPercentage ?? "N/A",
        deaths: deathsByFight
      });
    }

    if (finalFightData.length === 0) {
      console.log("⚠️ No valid boss fights found in this report.");
      return;
    }

    const dir = "logs";
    await mkdir(dir, { recursive: true });

    const fileName = `${dir}/${germanDate}_${report.title.replace(/\s/g, "_")}_Fights.json`;

    await saveToJson(fileName, finalFightData);
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
