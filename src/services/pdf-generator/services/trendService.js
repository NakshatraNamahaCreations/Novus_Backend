
import prisma from '../../../lib/prisma.js';

// Helper functions
function safeTrim(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function isHtmlPresent(html) {
  if (!html) return false;
  const trimmed = safeTrim(html);
  if (!trimmed) return false;
  // Check if it has HTML tags
  return /<[a-z][\s\S]*>/i.test(trimmed);
}

function formatValueWithUnit(value, unit) {
  const v = safeTrim(String(value));
  const u = safeTrim(unit);
  if (!v) return "—";
  return u ? `${v} ${u}` : v;
}

export class TrendService {
  static async buildTrendMap({ results, patientId }) {
    const trendMap = new Map();

    for (const result of results) {
      // Skip radiology reports (they have HTML content)
      if (isHtmlPresent(result.reportHtml)) continue;

      const testId = result.testId ?? result.test?.id;
      if (!testId) continue;

      const previousResults = await prisma.patientTestResult.findMany({
        where: {
          patientId: Number(patientId),
          testId: Number(testId),
          ...(result.createdAt
            ? { createdAt: { lt: result.createdAt } }
            : { id: { lt: result.id } }),
        },
        orderBy: result.createdAt ? { createdAt: "desc" } : { id: "desc" },
        take: 3,
        include: {
          parameterResults: {
            include: { parameter: true },
            orderBy: { parameterId: "asc" },
          },
        },
      });

      const previousByIndex = previousResults.map(prev => {
        const perParam = new Map();
        for (const pr of prev.parameterResults || []) {
          // Prefer valueText so "6.0" stays "6.0" instead of becoming "6".
          const value =
            (pr.valueText !== null && pr.valueText !== undefined && pr.valueText !== ""
              ? pr.valueText
              : pr.valueNumber) ?? "—";
          const unit = pr.unit || pr.parameter?.unit || "";
          perParam.set(pr.parameterId, formatValueWithUnit(value, unit));
        }
        return { 
          date: prev.createdAt || prev.updatedAt || null, 
          perParam 
        };
      });

      for (const pr of result.parameterResults || []) {
        const trends = previousByIndex.map(x => ({
          date: x.date,
          value: x.perParam.get(pr.parameterId) ?? "",
        }));
        trendMap.set(`${testId}:${pr.parameterId}`, trends);
      }
    }

    return trendMap;
  }

  static hasAnyTrendsForTest(trendMap, testId, parameterResults) {
    if (!trendMap || !parameterResults || parameterResults.length === 0) {
      return false;
    }

    for (const pr of parameterResults) {
      const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
      if (trends.some(item => {
        const value = safeTrim(item.value);
        return value && value !== "—";
      })) {
        return true;
      }
    }
    
    return false;
  }

  static generateTrendsHtml(trendMap, testId, parameterResults, dates) {
    function escapeHtml(s) {
      return String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const trendRows = parameterResults.map(pr => {
      const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
      const t1 = safeTrim(trends[0]?.value) || "—";
      const t2 = safeTrim(trends[1]?.value) || "—";
      const t3 = safeTrim(trends[2]?.value) || "—";

      return `
        <tr>
          <td style="width:40%"><b>${escapeHtml(pr.parameter?.name || "—")}</b></td>
          <td style="width:20%">${escapeHtml(t1)}</td>
          <td style="width:20%">${escapeHtml(t2)}</td>
          <td style="width:20%">${escapeHtml(t3)}</td>
        </tr>
      `;
    }).join("");

    return `
      <div class="trend-box">
        <div class="trend-title-right">Trends (last three reports)</div>
        <table>
          <thead>
            <tr>
              <th>Parameter</th>
              <th>${escapeHtml(dates[0])}</th>
              <th>${escapeHtml(dates[1])}</th>
              <th>${escapeHtml(dates[2])}</th>
            </tr>
          </thead>
          <tbody>${trendRows}</tbody>
        </table>
      </div>
    `;
  }
}