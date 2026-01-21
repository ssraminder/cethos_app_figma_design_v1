import FileUpload from "@/components/FileUpload";

export default function Step1Upload() {
  return (
    <>
      {/* Page Title */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold font-jakarta text-cethos-navy mb-2">
          Upload Your Documents
        </h1>
        <p className="text-base text-cethos-slate">
          Select the documents you need translated and certified
        </p>
      </div>

      {/* File Upload Section */}
      <FileUpload />
    </>
  );
}
