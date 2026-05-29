import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HomePage, ReaderPage } from "./pages";
import ErrorBoundary from "./components/ErrorBoundary";

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/reader/:bookTitle" element={<ReaderPage />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  );
}

export default App;
