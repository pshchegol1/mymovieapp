// Fetch trending shows and populate carousel
window.addEventListener('DOMContentLoaded', function() {
        // Also show random movies below the carousel on first load
        fetch('https://api.tvmaze.com/shows?page=1')
            .then(response => response.json())
            .then(shows => {
                // Pick 6 random shows with images
                const picks = [];
                const pool = shows.filter(show => show.image && show.image.medium);
                while (picks.length < 6 && pool.length > 0) {
                    const idx = Math.floor(Math.random() * pool.length);
                    picks.push(pool.splice(idx, 1)[0]);
                }
                let output = `<div style="text-align:center;margin-bottom:1.2rem;font-size:1.2rem;color:#2196f3;font-weight:600;"></div>`;
                picks.forEach((show, idx) => {
                    const showImage = show.image ? show.image.medium : './img/noimg.jpg';
                    const genres = show.genres && show.genres.length ? show.genres.join(', ') : 'Unknown';
                    const rating = (show.rating && show.rating.average !== null && show.rating.average !== undefined) ? show.rating.average : 'Unrated';
                    const summary = show.summary ? show.summary.replace(/<[^>]+>/g, '') : 'No summary available.';
                    const premiered = show.premiered ? show.premiered : 'Unknown';
                    const cardId = `random-modal-${idx}`;
                    output += `
                    <div class="modern-card animate__animated animate__fadeInUp" style="animation-delay: ${idx * 0.07}s">
                      <div class="modern-card-img-wrap">
                        <img src="${showImage}" alt="${show.name}" class="modern-card-img">
                      </div>
                      <div class="modern-card-body">
                        <h5 class="modern-card-title">${show.name}</h5>
                        <div class="modern-card-meta">
                          <span class="badge bg-info">${genres}</span>
                          <span class="badge bg-dark">⭐ ${rating}</span>
                          <span class="badge bg-secondary">${premiered}</span>
                        </div>
                        <p class="modern-card-summary">${summary.substring(0, 100)}...</p>
                        <button type="button" class="btn btn-primary btn-sm mt-2" data-bs-toggle="modal" data-bs-target="#${cardId}">More Info</button>
                      </div>
                    </div>
                    <div class="modal fade" id="${cardId}" tabindex="-1" role="dialog" aria-labelledby="${cardId}Label" aria-hidden="true">
                      <div class="modal-dialog" role="document">
                        <div class="modal-content">
                          <div class="modal-header">
                            <h5 class="modal-title" id="${cardId}Label">${show.name}</h5>
                            <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                              <span aria-hidden="true">&times;</span>
                            </button>
                          </div>
                          <div class="modal-body">
                            <img src="${showImage}" alt="${show.name}" class="img-fluid mb-2">
                            <p><strong>Genres:</strong> ${genres}</p>
                            <p><strong>Rating:</strong> ${rating}</p>
                            <p><strong>Premiered:</strong> ${premiered}</p>
                            <p><strong>Summary:</strong> ${summary}</p>
                            <a href="${show.officialSite || show.url}" target="_blank" class="btn btn-outline-info btn-sm">Official Site</a>
                          </div>
                          <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                          </div>
                        </div>
                      </div>
                    </div>
                    `;
                });
                const display = document.querySelector('.display-data');
                if (display) display.innerHTML = output;
                // Animate cards in
                document.querySelectorAll('.modern-card').forEach((card, i) => {
                    card.style.opacity = 0;
                    setTimeout(() => {
                      card.style.opacity = 1;
                    }, 100 + i * 80);
                });
                // Fix for Bootstrap modal triggers (for Bootstrap 4, use data-toggle/data-target)
                document.querySelectorAll('.btn[data-bs-toggle="modal"]').forEach(btn => {
                    btn.setAttribute('data-toggle', 'modal');
                    btn.setAttribute('data-target', btn.getAttribute('data-bs-target'));
                });
            });
    // Example: Use TVMaze's shows endpoint for trending/popular shows
    fetch('https://api.tvmaze.com/shows?page=1')
        .then(response => response.json())
        .then(shows => {
            // Pick first 15 shows with images
            const trending = shows.filter(show => show.image && show.image.original).slice(0, 15);
            const carouselInner = document.querySelector('#trendingCarousel .carousel-inner');
            const carouselIndicators = document.querySelector('#trendingCarousel .carousel-indicators');
            if (!carouselInner || !carouselIndicators) return;

            let innerHTML = '';
            let indicatorsHTML = '';
            trending.forEach((show, idx) => {
                const genres = show.genres && show.genres.length ? show.genres.join(', ') : 'Drama';
                const rating = show.rating && show.rating.average ? show.rating.average : 'N/A';
                innerHTML += `
                  <div class="carousel-item${idx === 0 ? ' active' : ''}">
                    <img class="d-block w-100" src="${show.image.original}" alt="${show.name}" style="height:320px; object-fit:cover; border-radius: 1.2rem 1.2rem 0 0;" onerror=\"this.onerror=null;this.src='./img/noimg.jpg';\">
                    <div class="carousel-caption d-none d-md-block">
                      <h5>${show.name}</h5>
                      <p><strong>Genre:</strong> ${genres}</p>
                      <p><strong>Rating:</strong> ${rating}</p>
                    </div>
                  </div>
                `;
                indicatorsHTML += `<li data-target='#trendingCarousel' data-slide-to='${idx}'${idx === 0 ? ' class="active"' : ''}></li>`;
            });
            carouselInner.innerHTML = innerHTML;
            carouselIndicators.innerHTML = indicatorsHTML;
        })
        .catch(err => {
            // fallback: do nothing, keep static images
            console.error('Failed to load trending shows for carousel', err);
        });
});
window.addEventListener('load',function(e)
{

    $('#myModal').on('shown.bs.modal', function () {
        $('#myInput').trigger('focus')
        
      })

    const searchButton = document.querySelector('#searchButton');
    const form = document.querySelector('form');

    form.addEventListener('submit', function(e)
    {
        e.preventDefault();

        const searchInput = document.querySelector('.search-input').value.trim();
        

        // Show loading spinner
        let display = document.querySelector('.display-data');
        display.innerHTML = `<div class="spinner-container"><div class="lds-dual-ring"></div></div>`;

        fetch(`https://api.tvmaze.com/search/shows?q=${searchInput}`)
        .then((data) => {
            return data.json();
        })
        .then(function(data) {
            console.log(data);

            let output = '';
            data.forEach((element, idx) => {
                const show = element.show;
                const showImage = show.image ? show.image.medium : './img/noimg.jpg';
                const genres = show.genres && show.genres.length ? show.genres.join(', ') : 'Unknown';
                const rating = (show.rating && show.rating.average !== null && show.rating.average !== undefined) ? show.rating.average : 'Unrated';
                const summary = show.summary ? show.summary.replace(/<[^>]+>/g, '') : 'No summary available.';
                const premiered = show.premiered ? show.premiered : 'Unknown';
                const cardId = `show-modal-${idx}`;

                output += `
                <div class="modern-card animate__animated animate__fadeInUp" style="animation-delay: ${idx * 0.07}s">
                  <div class="modern-card-img-wrap">
                    <img src="${showImage}" alt="${show.name}" class="modern-card-img">
                  </div>
                  <div class="modern-card-body">
                    <h5 class="modern-card-title">${show.name}</h5>
                    <div class="modern-card-meta">
                      <span class="badge bg-info">${genres}</span>
                      <span class="badge bg-dark">⭐ ${rating}</span>
                      <span class="badge bg-secondary">${premiered}</span>
                    </div>
                    <p class="modern-card-summary">${summary.substring(0, 100)}...</p>
                    <button type="button" class="btn btn-primary btn-sm mt-2" data-bs-toggle="modal" data-bs-target="#${cardId}">More Info</button>
                  </div>
                </div>
                `;
                // Append modal HTML outside the card for Bootstrap 4 compatibility
                output += `
                  <div class="modal fade" id="${cardId}" tabindex="-1" role="dialog" aria-labelledby="${cardId}Label" aria-hidden="true">
                    <div class="modal-dialog" role="document">
                      <div class="modal-content">
                        <div class="modal-header">
                          <h5 class="modal-title" id="${cardId}Label">${show.name}</h5>
                          <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                          </button>
                        </div>
                        <div class="modal-body">
                          <img src="${showImage}" alt="${show.name}" class="img-fluid mb-2">
                          <p><strong>Genres:</strong> ${genres}</p>
                          <p><strong>Rating:</strong> ${rating}</p>
                          <p><strong>Premiered:</strong> ${premiered}</p>
                          <p><strong>Summary:</strong> ${summary}</p>
                          <a href="${show.officialSite || show.url}" target="_blank" class="btn btn-outline-info btn-sm">Official Site</a>
                        </div>
                        <div class="modal-footer">
                          <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                        </div>
                      </div>
                    </div>
                  </div>
                `;
            });
            display.innerHTML = output;
            // Animate cards in
            document.querySelectorAll('.modern-card').forEach((card, i) => {
                card.style.opacity = 0;
                setTimeout(() => {
                  card.style.opacity = 1;
                }, 100 + i * 80);
            });
            // Fix for Bootstrap modal triggers (for Bootstrap 4, use data-toggle/data-target)
            document.querySelectorAll('.btn[data-bs-toggle="modal"]').forEach(btn => {
                btn.setAttribute('data-toggle', 'modal');
                btn.setAttribute('data-target', btn.getAttribute('data-bs-target'));
            });
            form.reset();
        })
        .catch(function(err){console.log(err);})


        //  https://api.tvmaze.com/search/shows?q=girls



    })// on click event



})//window load

