export class ConditionsSection {
  static generate() {
    const points = [
      "The test results reported herein pertain only to the specimen received and tested by Novus Health Labs.",
      "It is presumed that the specimen submitted belongs to the patient named or identified in the test requisition form. Test results released pertain to the specimen submitted.",
      "Laboratory investigations are only a tool to facilitate arriving at a diagnosis and should be clinically correlated by the Referring Physician.",
      "All tests are performed using validated laboratory methods and internal quality control procedures.",
      "Test results are dependent on the quality of the sample received by the Laboratory and the assay technology.",
      "Report delivery may be delayed due to unforeseen technical or operational circumstances. Inconvenience is regretted.",
      "A requested test may not be performed if:",
      "• The specimen received is insufficient or inappropriate, or the specimen quality is unsatisfactory",
      "• Incorrect specimen type",
      "• Request for testing is withdrawn by the ordering doctor or patient",
      "• There is a discrepancy between the label on the specimen container and the name on the test requisition form",
      "Test results may show interlaboratory variations.",
      "Test results are not valid for medico-legal purposes.",
      "This is a computer-generated medical diagnostic report validated by an Authorized Medical Practitioner/Doctor. The report does not need a physical signature.",
    ];

    // Render nested bullets properly
    const html = points
      .map(p => {
        if (p.startsWith("•")) return `<li class="sub">${p.replace(/^•\s*/, "")}</li>`;
        return `<li>${p}</li>`;
      })
      .join("");

    return `
      <div class="conditions">
        <div class="conditions-title">CONDITIONS OF LABORATORY TESTING & REPORTING</div>
        <ul class="conditions-list">
          ${html}
        </ul>
      </div>
    `;
  }
}
