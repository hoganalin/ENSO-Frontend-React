interface PaginationProps {
  pagination: {
    current_page: number;
    has_next: boolean;
    has_pre: boolean;
    total_pages: number;
  };
  onChangePage: (page: number) => void; //不回傳東西，所以是 void
}

function Pagination({
  pagination,
  onChangePage,
}: PaginationProps): JSX.Element {
  return (
    <nav aria-label="Page navigation " className="pt-8 md:pt-12 pb-8 md:pb-12">
      <ul className="flex justify-center  list-none gap-1">
        {/* 上一頁 */}
        <li>
          <a
            className={`block px-3 py-2 rounded-md text-sm no-underline ${pagination.has_pre ? "text-gray-700 hover:bg-gray-100" : "text-gray-300 pointer-events-none"}`}
            href="#"
            aria-label="Previous"
            onClick={(e) => {
              e.preventDefault();
              onChangePage(pagination.current_page - 1);
            }}
          >
            <span aria-hidden="true">&laquo;</span>
          </a>
        </li>

        {Array.from({ length: pagination.total_pages }).map((_, index) => (
          <li key={index}>
            <a
              className={`block px-3 py-2 rounded-md text-sm no-underline
             ${
               pagination.current_page === index + 1
                 ? "bg-enso-primary text-white"
                 : "text-gray-700 hover:bg-gray-100"
             }`}
              href="#"
              onClick={(e) => {
                e.preventDefault();
                onChangePage(index + 1);
              }}
            >
              {index + 1}
            </a>
          </li>
        ))}
        <li>
          <a
            className={`block px-3 py-2 rounded-md text-sm no-underline
           ${
             pagination.has_next
               ? "text-gray-700 hover:bg-gray-100"
               : "text-gray-300 pointer-events-none"
           }`}
            href="#"
            aria-label="Next"
            onClick={(e) => {
              e.preventDefault();
              onChangePage(pagination.current_page + 1);
            }}
          >
            <span aria-hidden="true">&raquo;</span>
          </a>
        </li>
      </ul>
    </nav>
  );
}

export default Pagination;
