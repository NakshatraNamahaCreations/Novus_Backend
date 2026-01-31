// services/trendService.js
import { PrismaClient } from "@prisma/client";
import { StringUtils } from "../utils/stringUtils.js";

const prisma = new PrismaClient();

export class TrendService {
  static async buildTrendMap({ results, patientId }) {
    const trendMap = new Map();

    for (const result of results) {
      if (StringUtils.isHtmlPresent(result.reportHtml)) continue;

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
          const value = pr.valueNumber ?? pr.valueText ?? "—";
          const unit = pr.unit || pr.parameter?.unit || "";
          perParam.set(pr.parameterId, StringUtils.formatValueWithUnit(value, unit));
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
        const value = StringUtils.safeTrim(item.value);
        return value && value !== "—";
      })) {
        return true;
      }
    }
    
    return false;
  }

  static generateTrendsHtml(trendMap, testId, parameterResults, dates) {
    const trendRows = parameterResults.map(pr => {
      const trends = trendMap.get(`${testId}:${pr.parameterId}`) || [];
      const t1 = StringUtils.safeTrim(trends[0]?.value) || "—";
      const t2 = StringUtils.safeTrim(trends[1]?.value) || "—";
      const t3 = StringUtils.safeTrim(trends[2]?.value) || "—";

      return `
        <tr>
          <td style="width:40%"><b>${StringUtils.escapeHtml(pr.parameter?.name || "—")}</b></td>
          <td style="width:20%">${StringUtils.escapeHtml(t1)}</td>
          <td style="width:20%">${StringUtils.escapeHtml(t2)}</td>
          <td style="width:20%">${StringUtils.escapeHtml(t3)}</td>
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
              <th>${StringUtils.escapeHtml(dates[0])}</th>
              <th>${StringUtils.escapeHtml(dates[1])}</th>
              <th>${StringUtils.escapeHtml(dates[2])}</th>
            </tr>
          </thead>
          <tbody>${trendRows}</tbody>
        </table>
      </div>
    `;
  }
}