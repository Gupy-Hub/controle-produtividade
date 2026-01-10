Produtividade.Importacao = Produtividade.Importacao || {};

Produtividade.Importacao.Validacao = {
    
    mapaUsuariosPorNome: null,
    mapaUsuariosPorId: null,

    processar: async function(input) {
        if (!input.files || input.files.length === 0) return;

        const btnTextoOriginal = input.nextElementSibling ? input.nextElementSibling.innerHTML : "Importar";
        if(input.nextElementSibling) input.nextElementSibling.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lendo...';

        try {
            await this.carregarMapaUsuarios();

            let arquivosSucesso = 0;
            let totalRegistrosImportados = 0;
            let relatorioIgnorados = []; 
            let errosCriticos = [];

            for (let i = 0; i < input.files.length; i++) {
                const arquivo = input.files[i];
                try {
                    const resultado = await this.processarArquivoIndividual(arquivo);
                    arquivosSucesso++;
                    totalRegistrosImportados += resultado.importados;
                    
                    if (resultado.ignorados && resultado.ignorados.length > 0) {
                        resultado.ignorados.forEach(item => {
                            relatorioIgnorados.push(`${item.nome} (ID Planilha: ${item.id})`);
                        });
                    }
                } catch (err) {
                    console.error(`Erro no arquivo ${arquivo.name}:`, err);
                    errosCriticos.push(`${arquivo.name}: ${err.message}`);
                }
            }

            this.exibirModalRelatorio(arquivosSucesso, totalRegistrosImportados, relatorioIgnorados, errosCriticos);

            if(Produtividade.Geral) Produtividade.Geral.carregarTela();

        } catch (erroGeral) {
            console.error(erroGeral);
            alert("Erro crítico no processo de importação: " + erroGeral.message);
        } finally {
            input.value = ""; 
            if(input.nextElementSibling) input.nextElementSibling.innerHTML = btnTextoOriginal;
        }
    },

    normalizarTexto: function(texto) {
        if (!texto) return "";
        return texto.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    },

    carregarMapaUsuarios: async function() {
        const { data, error } = await Sistema.supabase.from('usuarios').select('id, nome');
        if (error) throw error;

        this.mapaUsuariosPorNome = {};
        this.mapaUsuariosPorId = {};
        
        data.forEach(u => {
            this.mapaUsuariosPorId[u.id] = u.id; 
            if(u.nome) {
                const chave = this.normalizarTexto(u.nome);
                this.mapaUsuariosPorNome[chave] = u.id;
            }
        });
    },

    processarArquivoIndividual: function(arquivo) {
        return new Promise((resolve, reject) => {
            const nomeLimpo = arquivo.name.split('.')[0];
            const regexData = /^(\d{2})(\d{2})(\d{4})$/;
            const match = nomeLimpo.match(regexData);

            if (!match) {
                reject(new Error("Nome inválido. Use formato ddmmaaaa.csv"));
                return;
            }

            const dataReferencia = `${match[3]}-${match[2]}-${match[1]}`;

            Papa.parse(arquivo, {
                header: true,
                skipEmptyLines: true, 
                complete: async (results) => {
                    try {
                        const resultadoBanco = await this.salvarDadosBanco(results.data, dataReferencia);
                        resolve(resultadoBanco); 
                    } catch (e) {
                        reject(e);
                    }
                },
                error: (err) => reject(new Error("Erro ao ler CSV"))
            });
        });
    },

    salvarDadosBanco: async function(linhas, dataRef) {
        const payload = [];
        const ignoradosNesteArquivo = [];

        for (const row of linhas) {
            if (!row.id_assistente && !row.assistente) continue; 
            if (row.assistente && row.assistente.trim() === 'Total') continue;
            if (!row.id_assistente && row.assistente === 'Total') continue;

            const nomeCsv = row.assistente ? row.assistente.trim() : 'Sem Nome';
            const idCsv = row.id_assistente ? parseInt(row.id_assistente.replace(/\D/g,'')) : null;

            let usuarioIdEncontrado = null;

            if (idCsv && this.mapaUsuariosPorId[idCsv]) {
                usuarioIdEncontrado = this.mapaUsuariosPorId[idCsv];
            } else {
                const nomeNormalizado = this.normalizarTexto(nomeCsv);
                if (this.mapaUsuariosPorNome[nomeNormalizado]) {
                    usuarioIdEncontrado = this.mapaUsuariosPorNome[nomeNormalizado];
                }
            }

            if (!usuarioIdEncontrado) {
                ignoradosNesteArquivo.push({ nome: nomeCsv, id: idCsv || 'S/ ID' });
                continue; 
            }

            const limparNum = (val) => val ? (parseInt(String(val).replace(/\./g, '')) || 0) : 0;

            payload.push({
                usuario_id: usuarioIdEncontrado,
                data_referencia: dataRef,
                quantidade: limparNum(row.documentos_validados),
                fifo: limparNum(row.documentos_validados_fifo),
                gradual_total: limparNum(row.documentos_validados_gradual_total),
                gradual_parcial: limparNum(row.documentos_validados_gradual_parcial),
                perfil_fc: limparNum(row.documentos_validados_perfil_fc),
                fator: 1
            });
        }

        if (payload.length > 0) {
            const { error: errDel } = await Sistema.supabase.from('producao').delete().eq('data_referencia', dataRef);
            if (errDel) throw new Error("Erro ao limpar dados antigos: " + errDel.message);

            const { error: errIns } = await Sistema.supabase.from('producao').insert(payload);
            if (errIns) throw new Error("Erro ao inserir no banco: " + errIns.message);
        }

        return { importados: payload.length, ignorados: ignoradosNesteArquivo };
    },

    exibirModalRelatorio: function(sucesso, totalReg, ignorados, errosCriticos) {
        const modalAntigo = document.getElementById('modal-importacao-resultado');
        if(modalAntigo) modalAntigo.remove();

        const temIgnorados = ignorados.length > 0;
        const temErros = errosCriticos.length > 0;
        const textoIgnorados = ignorados.join('\n');

        const html = `
        <div id="modal-importacao-resultado" class="fixed inset-0 bg-slate-900/60 z-[70] flex items-center justify-center backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div class="bg-slate-50 px-6 py-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 class="text-lg font-bold text-slate-800"><i class="fas fa-file-import mr-2"></i> Resultado da Importação</h3>
                    <button onclick="document.getElementById('modal-importacao-resultado').remove()" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times"></i></button>
                </div>
                <div class="p-6 overflow-y-auto custom-scrollbar space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div class="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-center">
                            <span class="block text-2xl font-black text-emerald-600">${sucesso}</span>
                            <span class="text-xs font-bold text-emerald-800 uppercase">Arquivos Lidos</span>
                        </div>
                        <div class="bg-blue-50 border border-blue-100 p-3 rounded-lg text-center">
                            <span class="block text-2xl font-black text-blue-600">${totalReg}</span>
                            <span class="text-xs font-bold text-blue-800 uppercase">Registros Salvos</span>
                        </div>
                    </div>
                    ${temIgnorados ? `
                    <div class="border border-amber-200 bg-amber-50 rounded-lg p-4">
                        <div class="flex justify-between items-center mb-2">
                            <h4 class="text-sm font-bold text-amber-800 flex items-center gap-2"><i class="fas fa-exclamation-triangle"></i> Não Encontrados (${ignorados.length})</h4>
                            <button onclick="Produtividade.Importacao.Validacao.copiarErro()" class="text-xs bg-white border border-amber-300 text-amber-700 px-2 py-1 rounded hover:bg-amber-100 font-bold shadow-sm transition"><i class="fas fa-copy"></i> Copiar Lista</button>
                        </div>
                        <textarea id="area-ignorados" class="w-full h-32 text-xs bg-white border border-amber-200 rounded p-2 text-slate-600 font-mono outline-none resize-none" readonly>${textoIgnorados}</textarea>
                    </div>` : ''}
                    ${temErros ? `
                    <div class="border border-red-200 bg-red-50 rounded-lg p-4">
                        <h4 class="text-sm font-bold text-red-800 mb-2"><i class="fas fa-bug"></i> Erros Críticos</h4>
                        <ul class="list-disc list-inside text-xs text-red-700 font-mono">${errosCriticos.map(e => `<li>${e}</li>`).join('')}</ul>
                    </div>` : ''}
                    ${!temIgnorados && !temErros ? `
                    <div class="text-center py-4">
                        <i class="fas fa-check-circle text-4xl text-emerald-400 mb-2"></i>
                        <p class="text-sm font-bold text-emerald-700">Tudo certo! Todos os usuários foram importados.</p>
                    </div>` : ''}
                </div>
                <div class="bg-slate-50 px-6 py-4 flex justify-end border-t border-slate-100">
                    <button onclick="document.getElementById('modal-importacao-resultado').remove()" class="bg-slate-800 hover:bg-slate-900 text-white px-6 py-2 rounded-lg font-bold text-sm shadow-md transition">Fechar</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
    },

    copiarErro: function() {
        const area = document.getElementById('area-ignorados');
        if(area) {
            area.select();
            document.execCommand('copy');
            if (navigator.clipboard) navigator.clipboard.writeText(area.value);
        }
    },

    // --- NOVA FUNÇÃO: Limpar Banco ---
    limparBancoCompleto: async function() {
        // Confirmação dupla por segurança
        if (!confirm("⚠️ PERIGO: Isso apagará TODOS os dados de produtividade de TODOS os dias e meses.\n\nDeseja realmente continuar?")) return;
        if (!confirm("Última chance: Tem certeza absoluta? Essa ação não pode ser desfeita.")) return;

        try {
            // Usa SQL puro via RPC ou deleta sem filtro (dependendo da permissão da policy do Supabase)
            // Tenta deletar onde ID > 0 (hack comum para 'delete all' se truncate não estiver exposto na API JS)
            const { error } = await Sistema.supabase
                .from('producao')
                .delete()
                .neq('id', 0); // Deleta tudo que tem ID diferente de 0 (ou seja, tudo)

            if (error) throw error;

            alert("Banco de dados de produção resetado com sucesso!");
            if(Produtividade.Geral) Produtividade.Geral.carregarTela();

        } catch (error) {
            console.error(error);
            alert("Erro ao limpar banco: " + error.message);
        }
    }
};