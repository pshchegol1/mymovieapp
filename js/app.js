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
        console.log(searchInput);



        fetch(`https://api.tvmaze.com/search/shows?q=${searchInput}`)
        .then((data)=>{
            return data.json();
        })
        .then(function(data){
            console.log(data);

            let output='';

            data.forEach(element => {

                const w = element["show"]["image"]
                let showImage = "";
                
                if(w !== null )
                {

                    output +=`
                 

                    <div class="mt-5 card custom-card border-primary mb-3" style="max-width: 20rem;">
                        <div class="card-header text-center"><span class="badge bg-info">${element.show.name}</span></div>
                        <div class="card-body">
                            <h4 class=" text-center card-title"><img src="${element.show.image.medium}" alt="img"></h4>
                            <p class=" text-center card-title"><span class="badge bg-info">Genre: ${element.show.genres}</span></p>
                            
                           
                        </div>

                        <!-- Button trigger modal -->
                        <button type="button" class="btn btn-primary" data-toggle="modal" data-target="#exampleModal">
                          More Info...
                        </button>
                        
                        <!-- Modal -->
                        <div class="modal fade" id="exampleModal" tabindex="-1" role="dialog" aria-labelledby="exampleModalLabel" aria-hidden="true">
                          <div class="modal-dialog" role="document">
                            <div class="modal-content">
                              <div class="modal-header">
                                <h5 class="modal-title" id="exampleModalLabel">${element.show.name}</h5>
                                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                                  <span aria-hidden="true">&times;</span>
                                </button>
                              </div>
                              <div class="modal-body">
                                <h4></h4>
                              </div>
                              <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                                <button type="button" class="btn btn-primary">Save changes</button>
                              </div>
                            </div>
                          </div>
                        </div>
                    </div>
    
                    `;
                }
                else
                {
                  showImage = "./../img/noimg.jpg"
                }




                
                
            });
            document.querySelector('.display-data').innerHTML = output;
            form.reset();
        })
        .catch(function(err){console.log(err);})


        //  https://api.tvmaze.com/search/shows?q=girls



    })// on click event



})//window load

