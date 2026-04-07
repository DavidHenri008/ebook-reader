import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage, ReaderPage } from "./pages";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/reader" element={<ReaderPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
